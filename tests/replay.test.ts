import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessType } from "../src/harnesses/types.ts";
import { runShim } from "../src/shim/runtime-shim.ts";
import { loadState, type RunnerState } from "../src/state.ts";
import {
	findNormalizedTranscripts,
	type NormalizedTranscriptItem,
} from "./normalize-transcripts.ts";
import { stripAbsolutePath } from "./test-utils.ts";

const sanitizeState = (s: RunnerState | null) =>
	s ? { script: s.script, status: s.status, currentStep: s.currentStep } : null;

const sharedSnapshotPath = path.resolve(
	import.meta.dirname,
	"fixtures/transcripts/curtain-test.snapshot.json",
);

async function replayNormalizedTranscript(
	harness: HarnessType,
	conversationId: string,
	filePath: string,
) {
	const repoRoot = path.resolve(import.meta.dirname, "..");
	const workspacePath = path.join(repoRoot, "examples");

	const rawJson = fs.readFileSync(filePath, "utf-8");
	const replacedJson = rawJson.replaceAll("{{workspace}}", workspacePath);
	const items: NormalizedTranscriptItem[] = JSON.parse(replacedJson);

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-replay-"));

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
	};

	const trace: Array<{
		hook: string;
		decision?: string;
		reason?: string;
		injectSteps?: unknown[];
		state: Omit<RunnerState, "steps"> | null;
	}> = [];
	let invocationNum = 0;

	const invoke = async (
		hook: "pre" | "stop",
		extra: Record<string, unknown>,
	) => {
		const payload = {
			conversationId,
			session_id: conversationId,
			workspacePaths: [workspacePath],
			workspacePath,
			cwd: workspacePath,
			...extra,
		};
		const egress = await runShim(hook, JSON.stringify(payload), env);
		const out = egress.stdout ? JSON.parse(egress.stdout) : {};

		const decision =
			out.decision === "block"
				? "continue"
				: (out.decision ?? (hook === "stop" ? "allow" : undefined));
		const reason = out.reason;
		const injectedMessage =
			out.injectSteps?.[0]?.ephemeralMessage ??
			out.hookSpecificOutput?.additionalContext;
		const injectSteps = injectedMessage
			? [{ ephemeralMessage: injectedMessage }]
			: undefined;

		trace.push({
			hook,
			...(decision ? { decision } : {}),
			...(reason ? { reason } : {}),
			...(injectSteps ? { injectSteps } : {}),
			state: sanitizeState(loadState(conversationId, env)),
		});
	};

	try {
		for (const item of items) {
			if (item.type === "user") {
				await invoke("pre", {
					prompt: item.content,
					...(harness === "agy" && { invocationNum: invocationNum++ }),
					...(harness === "codex" && {
						hook_event_name: "UserPromptSubmit",
					}),
				});
			} else if (item.type === "assistant") {
				await invoke("stop", {
					last_assistant_message: item.content,
					...(harness === "agy" && {
						terminationReason: "model_stop",
						fullyIdle: true,
					}),
					...(harness === "codex" && { hook_event_name: "Stop" }),
				});
			}
		}
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}

	return stripAbsolutePath(trace, repoRoot);
}

const fixtures = findNormalizedTranscripts();

describe("Transcript Replay Integration", () => {
	it.each(fixtures)(
		"replays $harness transcript $conversationId against shared snapshot",
		async ({ harness, conversationId, filePath }) => {
			const trace = await replayNormalizedTranscript(
				harness,
				conversationId,
				filePath,
			);
			await expect(
				`${JSON.stringify(trace, null, "\t")}\n`,
			).toMatchFileSnapshot(sharedSnapshotPath);
		},
	);
});
