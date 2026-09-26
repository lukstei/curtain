import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunnerState } from "../state.ts";
import { agyHarness } from "./agy.ts";

describe("agyHarness", () => {
	const runningState: RunnerState = {
		script: "skills/test.md",
		status: "running",
		currentStep: 0,
		skillName: "curtain-test",
		steps: [
			{ index: 0, type: "auto", content: "Step 1" },
			{ index: 1, type: "auto", content: "Step 2" },
		],
	};

	const pausedState: RunnerState = {
		...runningState,
		status: "paused",
		currentStep: 0,
		steps: [
			{
				index: 0,
				type: "pause",
				content: "Step 1",
				instruction: "Check tests",
			},
			{ index: 1, type: "auto", content: "Step 2" },
		],
	};

	describe("detect", () => {
		it("detects AGY_HOOK_ACTIVE", () => {
			expect(agyHarness.detect({}, { AGY_HOOK_ACTIVE: "1" })).toBe(true);
		});

		it("detects ANTIGRAVITY_CONVERSATION_ID", () => {
			expect(
				agyHarness.detect({}, { ANTIGRAVITY_CONVERSATION_ID: "uuid-1" }),
			).toBe(true);
		});

		it("detects GEMINI_CLI or ANTIGRAVITY environment variables", () => {
			expect(agyHarness.detect({}, { GEMINI_CLI: "1" })).toBe(true);
			expect(agyHarness.detect({}, { ANTIGRAVITY: "1" })).toBe(true);
		});

		it("returns false without environment indicators", () => {
			expect(
				agyHarness.detect(
					{
						artifactDirectoryPath: "/tmp/artifacts",
						transcriptPath: "/tmp/transcript.jsonl",
					},
					{},
				),
			).toBe(false);
		});
	});

	describe("resolveConversationId", () => {
		it("resolves from payload conversationId", () => {
			expect(
				agyHarness.resolveConversationId({ conversationId: "agy-conv-1" }, {}),
			).toBe("agy-conv-1");
		});

		it("resolves from env ANTIGRAVITY_CONVERSATION_ID", () => {
			expect(
				agyHarness.resolveConversationId(
					{},
					{ ANTIGRAVITY_CONVERSATION_ID: "env-conv" },
				),
			).toBe("env-conv");
		});

		it("falls back to default", () => {
			expect(agyHarness.resolveConversationId({}, {})).toBe("default");
		});
	});

	describe("handle", () => {
		it("returns pass on pre hook", () => {
			const res = agyHarness.handle(
				{ invocationNum: 0 },
				{
					conversationId: "c1",
					state: runningState,
					mode: "pre",
					env: {},
				},
			);
			expect(res.egress).toEqual({ exitCode: 0, stdout: "{}" });
			expect(res.nextState).toBe(runningState);
		});

		it("allows non-view_file tools to proceed unimpeded", () => {
			const res = agyHarness.handle(
				{
					toolCall: {
						name: "run_command",
						args: { CommandLine: "ls -la" },
					},
				},
				{
					conversationId: "c1",
					state: runningState,
					mode: "tool",
					env: {},
				},
			);
			expect(res.egress.exitCode).toBe(0);
			const out = JSON.parse(res.egress.stdout ?? "{}");
			expect(out.decision).toBe("allow");
			expect(res.nextState).toBe(runningState);
		});

		it("blocks backstage script read", () => {
			const scriptPath = path.resolve("/workspace", runningState.script);
			const res = agyHarness.handle(
				{
					workspacePaths: ["/workspace"],
					toolCall: {
						name: "view_file",
						args: { AbsolutePath: scriptPath },
					},
				},
				{
					conversationId: "c1",
					state: runningState,
					mode: "tool",
					env: {},
				},
			);
			expect(res.egress.exitCode).toBe(0);
			const out = JSON.parse(res.egress.stdout ?? "{}");
			expect(out.decision).toBe("deny");
			expect(out.reason).toContain("BLOCKED BY CURTAIN");
			expect(res.nextState).toBe(runningState);
		});

		it("blocks reading next/SKILL.md while running", () => {
			const res = agyHarness.handle(
				{
					workspacePaths: ["/workspace"],
					toolCall: {
						name: "view_file",
						args: {
							AbsolutePath: "/workspace/.agents/skills/next/SKILL.md",
							toolAction: "Reading next skill",
						},
					},
				},
				{
					conversationId: "c1",
					state: runningState,
					mode: "tool",
					env: {},
				},
			);
			expect(res.egress.exitCode).toBe(0);
			const out = JSON.parse(res.egress.stdout ?? "{}");
			expect(out.decision).toBe("deny");
			expect(out.reason).toContain("Only the user can advance execution");
		});

		it("resumes paused playbook on reading next/SKILL.md regardless of toolAction phrasing", () => {
			const res = agyHarness.handle(
				{
					workspacePaths: ["/workspace"],
					toolCall: {
						name: "view_file",
						args: {
							AbsolutePath: "/workspace/.agents/skills/next/SKILL.md",
							toolAction: "Reading instructions to resume",
							toolSummary: "Resume playbook",
						},
					},
				},
				{
					conversationId: "c1",
					state: pausedState,
					mode: "tool",
					env: {},
				},
			);
			expect(res.egress.exitCode).toBe(0);
			const out = JSON.parse(res.egress.stdout ?? "{}");
			expect(out.decision).toBe("deny");
			expect(out.reason).toContain("Step 2");
			expect(res.nextState?.status).toBe("running");
			expect(res.nextState?.currentStep).toBe(1);
		});

		it("blocks re-reading active skill definition while running", () => {
			const res = agyHarness.handle(
				{
					workspacePaths: ["/workspace"],
					toolCall: {
						name: "view_file",
						args: {
							AbsolutePath: "/workspace/.agents/skills/curtain-test/SKILL.md",
						},
					},
				},
				{
					conversationId: "c1",
					state: runningState,
					mode: "tool",
					env: {},
				},
			);
			expect(res.egress.exitCode).toBe(0);
			const out = JSON.parse(res.egress.stdout ?? "{}");
			expect(out.decision).toBe("deny");
			expect(out.reason).toContain("Playbook execution is already active");
			expect(res.nextState).toBe(runningState);
		});

		it("allows unrelated file reads", () => {
			const res = agyHarness.handle(
				{
					workspacePaths: ["/workspace"],
					toolCall: {
						name: "view_file",
						args: { AbsolutePath: "/workspace/src/app.ts" },
					},
				},
				{
					conversationId: "c1",
					state: runningState,
					mode: "tool",
					env: {},
				},
			);
			expect(res.egress.exitCode).toBe(0);
			const out = JSON.parse(res.egress.stdout ?? "{}");
			expect(out.decision).toBe("allow");
			expect(res.nextState).toBe(runningState);
		});

		it("continues loop on stop hook with next step", () => {
			const res = agyHarness.handle(
				{
					terminationReason: "model_stop",
				},
				{
					conversationId: "c1",
					state: runningState,
					mode: "stop",
					env: {},
				},
			);
			expect(res.egress.exitCode).toBe(0);
			const out = JSON.parse(res.egress.stdout ?? "{}");
			expect(out.decision).toBe("continue");
			expect(out.reason).toContain("Step 2");
			expect(res.nextState?.currentStep).toBe(1);
		});

		it("allows stop when state is paused", () => {
			const res = agyHarness.handle(
				{
					terminationReason: "model_stop",
				},
				{
					conversationId: "c1",
					state: pausedState,
					mode: "stop",
					env: {},
				},
			);
			expect(res.egress.exitCode).toBe(0);
			const out = JSON.parse(res.egress.stdout ?? "{}");
			expect(out.decision).toBe("allow");
			expect(res.nextState).toBe(pausedState);
		});
	});

	describe("getSkillDirs", () => {
		it("returns AGY skill search paths", () => {
			const home = os.homedir();
			const dirs = agyHarness.getSkillDirs(["/workspace"]);
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.agents/plugins",
				path.join(home, ".gemini/config/skills"),
				path.join(home, ".gemini/config/plugins"),
				path.join(home, ".gemini/antigravity/builtin/skills"),
			]);
		});

		it("returns search paths across multiple workspaces", () => {
			const home = os.homedir();
			const dirs = agyHarness.getSkillDirs(["/ws1", "/ws2"]);
			expect(dirs).toEqual([
				"/ws1/.agents/skills",
				"/ws1/skills",
				"/ws2/.agents/skills",
				"/ws2/skills",
				"/ws1/.agents/plugins",
				"/ws2/.agents/plugins",
				path.join(home, ".gemini/config/skills"),
				path.join(home, ".gemini/config/plugins"),
				path.join(home, ".gemini/antigravity/builtin/skills"),
			]);
		});
	});
});
