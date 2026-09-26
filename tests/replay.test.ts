import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessType } from "../src/harnesses/types.ts";
import type { HookLogEntry } from "../src/lib/logHook.ts";
import { runShimForTest } from "../src/shim/runtime-shim.ts";
import { loadState, type RunnerState } from "../src/state.ts";
import { stripAbsolutePath } from "./test-utils.ts";

const sanitizeState = (s: RunnerState | null) =>
	s ? { script: s.script, status: s.status, currentStep: s.currentStep } : null;

const sharedSnapshotPath = path.resolve(
	import.meta.dirname,
	"fixtures/hooks/curtain-test.snapshot.json",
);

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

	const trace: Array<{
		hook: string;
		decision?: string;
		reason?: string;
		injectSteps?: unknown[];
		state: Omit<RunnerState, "steps"> | null;
	}> = [];

	try {
		for (const entry of entries) {
			const replacedInput = entry.input.replaceAll(
				"{{workspace}}",
				workspacePath,
			);

			const egress = await runShimForTest(entry.hook, replacedInput, env);

			const out = egress.stdout ? JSON.parse(egress.stdout) : {};
			const expectedOut = entry.output ? JSON.parse(entry.output) : {};

			expect(out).toEqual(expectedOut);

			const injectedMessage =
				out.injectSteps?.[0]?.ephemeralMessage ??
				out.hookSpecificOutput?.additionalContext;

			let decision: string | undefined;
			let reason: string | undefined;
			let injectSteps: unknown[] | undefined;

			if (entry.hook === "stop") {
				if (
					out.decision === "block" ||
					out.decision === "continue" ||
					injectedMessage
				) {
					decision = "continue";
					reason = out.reason ?? injectedMessage;
				} else {
					decision = "allow";
				}
			} else {
				decision = out.decision;
				reason = out.reason;
				if (injectedMessage) {
					injectSteps = [{ ephemeralMessage: injectedMessage }];
				}
			}

			trace.push({
				hook: entry.hook,
				...(decision ? { decision } : {}),
				...(reason ? { reason } : {}),
				...(injectSteps ? { injectSteps } : {}),
				state: sanitizeState(loadState(conversationId, env)),
			});
		}
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}

	return stripAbsolutePath(trace, repoRoot);
}

const fixtures = findHookFixtures();

describe("Hook Log Replay Integration", () => {
	it.each(fixtures)(
		"replays $harness $fixtureName hook log against exact output and snapshot",
		async ({ harness, filePath, fixtureName }) => {
			const trace = await replayHookLog(harness, filePath);
			const harnessSnapshotPath = path.resolve(
				import.meta.dirname,
				`fixtures/hooks/${harness}/${fixtureName}.snapshot.json`,
			);
			const snapshotTarget = fs.existsSync(harnessSnapshotPath)
				? harnessSnapshotPath
				: sharedSnapshotPath;
			await expect(
				`${JSON.stringify(trace, null, "\t")}\n`,
			).toMatchFileSnapshot(snapshotTarget);
		},
	);
});
