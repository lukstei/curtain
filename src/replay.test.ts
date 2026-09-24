import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessType } from "./harnesses/types.ts";
import { runShim } from "./shim/runtime-shim.ts";
import { loadState, type RunnerState } from "./state.ts";
import { stripAbsolutePath } from "./test-utils.ts";

const sanitizeState = (s: RunnerState | null) =>
	s ? (({ steps: _steps, ...rest }) => rest)(s) : null;

const fixtures = [
	{
		harness: "agy" as HarnessType,
		conversationId: "66756276-9b45-4fd5-8c99-2d03252bf57c",
	},
];

const sharedSnapshotPath = path.resolve(
	import.meta.dirname,
	"../tests/fixtures/transcripts/curtain-test.snapshot.json",
);

async function replayTranscript(harness: HarnessType, conversationId: string) {
	const repoRoot = path.resolve(import.meta.dirname, "..");
	const workspacePath = path.join(repoRoot, "examples");
	const fixturePath = path.resolve(
		import.meta.dirname,
		`../tests/fixtures/transcripts/${harness}/${conversationId}.jsonl`,
	);

	const normalizedContent = fs
		.readFileSync(fixturePath, "utf-8")
		.replace(/\/Users\/[^/\s"']+\/Downloads\/skill-test/g, workspacePath);

	const lines = normalizedContent.trim().split("\n").filter(Boolean);
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-replay-"));
	const mockTranscriptPath = path.join(tmpDir, "transcript.jsonl");

	const env: NodeJS.ProcessEnv = {
		...process.env,
		AGY_PLUGIN_DATA: tmpDir,
		HOME: tmpDir,
		...(harness === "agy"
			? { AGY_HOOK_ACTIVE: "1", ANTIGRAVITY_CONVERSATION_ID: conversationId }
			: {}),
	};

	const trace: Array<{
		stepIndex: number;
		hook: string;
		decision?: string;
		reason?: string;
		injectSteps?: unknown[];
		state: Omit<RunnerState, "steps"> | null;
	}> = [];
	let invocationNum = 0;
	let executionNum = 0;

	const invoke = async (
		hook: "pre" | "tool" | "stop",
		stepIndex: number,
		extra: Record<string, unknown>,
	) => {
		const payload = {
			conversationId,
			workspacePaths: [workspacePath],
			transcriptPath: mockTranscriptPath,
			...extra,
		};
		const egress = await runShim(hook, JSON.stringify(payload), env);
		const out = egress.stdout ? JSON.parse(egress.stdout) : {};
		trace.push({
			stepIndex,
			hook,
			decision: out.decision,
			reason: out.reason,
			injectSteps: out.injectSteps,
			state: sanitizeState(loadState(conversationId, env)),
		});
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		fs.appendFileSync(mockTranscriptPath, `${line}\n`);

		let item: Record<string, unknown>;
		try {
			item = JSON.parse(line);
		} catch {
			continue;
		}

		if (item.type === "USER_INPUT" || item.source === "USER_EXPLICIT") {
			await invoke("pre", (item.step_index as number) ?? i, {
				invocationNum: invocationNum++,
				initialNumSteps: i + 1,
				prompt: typeof item.content === "string" ? item.content : undefined,
			});
			continue;
		}

		const toolCalls = Array.isArray(item.tool_calls)
			? (item.tool_calls as Array<Record<string, unknown>>)
			: [];
		for (const tc of toolCalls) {
			await invoke("tool", (item.step_index as number) ?? i, {
				toolCall: tc,
				tool_name: tc.name,
				tool_input: tc.args ?? tc.input,
				stepIdx: (item.step_index as number) ?? i,
			});
		}

		const isModelTurn =
			(item.type === "PLANNER_RESPONSE" || item.source === "MODEL") &&
			item.type !== "GENERIC";
		const nextItem = i + 1 < lines.length ? JSON.parse(lines[i + 1]) : null;

		if (isModelTurn && nextItem?.type !== "GENERIC") {
			await invoke("stop", (item.step_index as number) ?? i, {
				executionNum: ++executionNum,
				terminationReason: "model_stop",
				fullyIdle: true,
				last_assistant_message:
					typeof item.content === "string" ? item.content : undefined,
			});
		}
	}

	fs.rmSync(tmpDir, { recursive: true, force: true });
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
