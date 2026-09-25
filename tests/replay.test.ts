import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessType } from "../src/harnesses/types.ts";
import { runShim } from "../src/shim/runtime-shim.ts";
import { loadState, type RunnerState } from "../src/state.ts";
import { stripAbsolutePath } from "./test-utils.ts";

const sanitizeState = (s: RunnerState | null) =>
	s ? { script: s.script, status: s.status, currentStep: s.currentStep } : null;

const fixtures = [
	{
		harness: "agy" as HarnessType,
		conversationId: "66756276-9b45-4fd5-8c99-2d03252bf57c",
	},
	{
		harness: "codex" as HarnessType,
		conversationId: "01a0d54d-356d-77b3-bc97-04cbd84bb28b",
	},
];

const sharedSnapshotPath = path.resolve(
	import.meta.dirname,
	"fixtures/transcripts/curtain-test.snapshot.json",
);

async function replayTranscript(harness: HarnessType, conversationId: string) {
	const repoRoot = path.resolve(import.meta.dirname, "..");
	const workspacePath = path.join(repoRoot, "examples");
	const fixturePath = path.resolve(
		import.meta.dirname,
		`fixtures/transcripts/${harness}/${conversationId}.jsonl`,
	);

	const normalizedContent = fs
		.readFileSync(fixturePath, "utf-8")
		.replace(/\/Users\/[^/\s"']+\/Downloads\/skill-test/g, workspacePath);

	const lines = normalizedContent.trim().split("\n").filter(Boolean);
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-replay-"));
	const mockTranscriptPath = path.join(tmpDir, "transcript.jsonl");

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
			transcriptPath: mockTranscriptPath,
			transcript_path: mockTranscriptPath,
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
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			fs.appendFileSync(mockTranscriptPath, `${line}\n`);

			let item: Record<string, unknown>;
			try {
				item = JSON.parse(line);
			} catch {
				continue;
			}

			if (harness === "codex") {
				const payload = item.payload as Record<string, unknown> | undefined;
				const meta = payload?.internal_chat_message_metadata_passthrough as
					| Record<string, unknown>
					| undefined;
				const contentKinds = meta?.content_item_kinds as string[] | undefined;
				const contentList = payload?.content as
					| Array<{ text?: string }>
					| undefined;

				if (
					item.type === "response_item" &&
					payload?.role === "user" &&
					contentKinds?.includes("user.text")
				) {
					await invoke("pre", {
						hook_event_name: "UserPromptSubmit",
						prompt: contentList?.[0]?.text,
					});
				} else if (
					item.type === "response_item" &&
					payload?.role === "assistant"
				) {
					await invoke("stop", {
						hook_event_name: "Stop",
						last_assistant_message: contentList?.[0]?.text,
					});
				}
			} else {
				if (item.type === "USER_INPUT" || item.source === "USER_EXPLICIT") {
					await invoke("pre", {
						invocationNum: invocationNum++,
						prompt: typeof item.content === "string" ? item.content : undefined,
					});
				} else if (
					item.type === "PLANNER_RESPONSE" ||
					item.source === "MODEL"
				) {
					await invoke("stop", {
						terminationReason: "model_stop",
						fullyIdle: true,
						last_assistant_message:
							typeof item.content === "string" ? item.content : undefined,
					});
				}
			}
		}
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}

	return stripAbsolutePath(trace, repoRoot);
}

describe("Transcript Replay Integration", () => {
	it.each(fixtures)(
		"replays $harness transcript $conversationId against shared snapshot",
		async ({ harness, conversationId }) => {
			const trace = await replayTranscript(harness, conversationId);
			await expect(
				`${JSON.stringify(trace, null, "\t")}\n`,
			).toMatchFileSnapshot(sharedSnapshotPath);
		},
	);
});
