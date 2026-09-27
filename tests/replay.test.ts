import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessType } from "../src/harnesses/types.ts";
import type { HookLogEntry } from "../src/lib/logHook.ts";
import { runShimForTest } from "../src/shim/runtime-shim.ts";
import { loadState, type RunnerState } from "../src/state.ts";
import type { HookMode } from "../src/types.ts";
import { stripAbsolutePath } from "./test-utils.ts";

function extractState(
	state: RunnerState | null,
): Omit<RunnerState, "steps"> | null {
	return state ? (({ steps, ...rest }) => rest)(state) : null;
}

function findHookFixtures(
	fixturesDir = path.resolve(import.meta.dirname, "fixtures/hooks"),
): Array<{
	harness: HarnessType;
	fixtureName: string;
	filePath: string;
}> {
	assert(
		fs.existsSync(fixturesDir),
		`Fixtures directory does not exist: ${fixturesDir}`,
	);

	const results: Array<{
		harness: HarnessType;
		fixtureName: string;
		filePath: string;
	}> = [];

	const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const harness = entry.name as HarnessType;
		const harnessDir = path.join(fixturesDir, entry.name);
		const files = fs.readdirSync(harnessDir);
		for (const file of files) {
			if (!file.endsWith(".jsonl")) continue;
			results.push({
				harness,
				fixtureName: path.basename(file, ".jsonl"),
				filePath: path.join(harnessDir, file),
			});
		}
	}

	assert(results.length > 0, "No hook fixtures discovered");
	return results;
}

async function replayHookLog(harness: HarnessType, filePath: string) {
	const repoRoot = path.resolve(import.meta.dirname, "..");
	const workspacePath = path.join(repoRoot, "examples");

	const rawContent = fs.readFileSync(filePath, "utf-8");
	const lines = rawContent.trim().split("\n").filter(Boolean);
	const entries: HookLogEntry[] = lines.map((l) => JSON.parse(l));

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-replay-"));

	const firstInput = JSON.parse(entries[0].input) as Record<string, unknown>;
	const conversationId = String(
		firstInput.conversationId ?? firstInput.session_id ?? "replay-session",
	);

	const rawRecordedWorkspace =
		Array.isArray(firstInput.workspacePaths) &&
		typeof firstInput.workspacePaths[0] === "string"
			? firstInput.workspacePaths[0]
			: typeof firstInput.cwd === "string"
				? firstInput.cwd
				: null;

	const recordedRepoRoot = rawRecordedWorkspace?.includes("/examples")
		? rawRecordedWorkspace.slice(
				0,
				rawRecordedWorkspace.lastIndexOf("/examples"),
			)
		: rawRecordedWorkspace;

	const env: NodeJS.ProcessEnv = {
		...process.env,
		HOME: tmpDir,
		...(harness === "agy" && {
			AGY_PLUGIN_DATA: tmpDir,
			AGY_HOOK_ACTIVE: "1",
			ANTIGRAVITY_CONVERSATION_ID: conversationId,
		}),
		...(harness === "codex" && {
			PLUGIN_DATA: tmpDir,
			CODEX_SESSION_ID: conversationId,
		}),
		...(harness === "claude" && {
			CLAUDE_PLUGIN_DATA: tmpDir,
			CLAUDE_CODE_SESSION_ID: conversationId,
		}),
	};

	try {
		for (const [index, entry] of entries.entries()) {
			let replacedInput = entry.input.replaceAll(
				"{{workspace}}",
				workspacePath,
			);
			if (recordedRepoRoot && recordedRepoRoot !== repoRoot) {
				replacedInput = replacedInput.replaceAll(recordedRepoRoot, repoRoot);
			}

			const egress = await runShimForTest(
				entry.hook as HookMode,
				replacedInput,
				env,
			);

			const actualOutput = egress.stdout ? JSON.parse(egress.stdout) : {};
			let expectedOutputStr = entry.output;
			if (recordedRepoRoot && recordedRepoRoot !== repoRoot) {
				expectedOutputStr = expectedOutputStr.replaceAll(
					recordedRepoRoot,
					repoRoot,
				);
			}
			const expectedOutput = expectedOutputStr
				? JSON.parse(expectedOutputStr)
				: {};

			expect(
				stripAbsolutePath(actualOutput, repoRoot),
				`Step ${index + 1} (${entry.hook}) stdout mismatch`,
			).toEqual(stripAbsolutePath(expectedOutput, repoRoot));

			const actualState = extractState(loadState(conversationId, env));
			const expectedState = entry.state ?? null;

			expect(
				stripAbsolutePath(actualState, repoRoot),
				`Step ${index + 1} (${entry.hook}) state mismatch`,
			).toEqual(stripAbsolutePath(expectedState, recordedRepoRoot ?? repoRoot));
		}
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

const fixtures = findHookFixtures();

describe("Hook Log Replay Integration", () => {
	it.each(fixtures)(
		"replays $harness $fixtureName hook log against exact output and state",
		async ({ harness, filePath }) => {
			await replayHookLog(harness, filePath);
		},
	);
});
