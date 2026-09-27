import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	advanceTurn,
	guardBackstageRead,
	guardSkillInvocation,
	resolveSkillInvocation,
	resolveUserPrompt,
	resumePlaybook,
	startPlaybook,
} from "./actions.ts";
import type { Script } from "./parser/index.ts";
import type { RunnerState } from "./state.ts";

describe("actions", () => {
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

	describe("advanceTurn", () => {
		it("allows when state is paused", () => {
			const res = advanceTurn({ state: pausedState, terminationReason: null });
			expect(res).toEqual({ action: "allow", nextState: pausedState });
		});

		it("allows when cancelled or interrupted", () => {
			const res = advanceTurn({
				state: runningState,
				terminationReason: "user cancelled turn",
			});
			expect(res).toEqual({ action: "allow", nextState: runningState });
		});

		it("advances to next step and returns continue", () => {
			const res = advanceTurn({ state: runningState, terminationReason: null });
			expect(res.action).toBe("continue");
			if (res.action === "continue") {
				expect(res.nextState.currentStep).toBe(1);
				expect(res.message).toContain("Step 2");
			}
		});

		it("finishes when on last step", () => {
			const lastStepState: RunnerState = {
				...runningState,
				currentStep: 1,
			};
			const res = advanceTurn({
				state: lastStepState,
				terminationReason: null,
			});
			expect(res).toEqual({ action: "allow", nextState: null });
		});
	});

	describe("resumePlaybook", () => {
		it("errors when state is not paused", () => {
			const res = resumePlaybook(runningState);
			expect(res.action).toBe("error");
			if (res.action === "error") {
				expect(res.message).toContain("Only the user can advance execution");
				expect(res.nextState).toBe(runningState);
			}
		});

		it("resumes when state is paused", () => {
			const res = resumePlaybook(pausedState);
			expect(res.action).toBe("resumed");
			if (res.action === "resumed") {
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.currentStep).toBe(1);
			}
		});
	});

	describe("startPlaybook", () => {
		const sampleScript: Script = {
			filePath: "skills/test.md",
			steps: [
				{ index: 0, type: "auto", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2" },
			],
		};

		it("starts playbook and initializes step 0", () => {
			const res = startPlaybook(sampleScript, "my-skill");
			expect(res.action).toBe("started");
			expect(res.nextState.skillName).toBe("my-skill");
			expect(res.nextState.status).toBe("running");
			expect(res.nextState.currentStep).toBe(0);
		});
	});

	describe("resolveUserPrompt", () => {
		it("errors on /next when no script is loaded", () => {
			const res = resolveUserPrompt({
				prompt: "/next",
				state: null,
				workspacePaths: ["/workspace"],
				harness: "claude",
			});
			expect(res).toEqual({
				action: "error",
				message: "BLOCKED BY CURTAIN: No script is currently loaded.",
				nextState: null,
			});
		});

		it("resumes on /next when state is loaded", () => {
			const res = resolveUserPrompt({
				prompt: "/next",
				state: pausedState,
				workspacePaths: ["/workspace"],
				harness: "claude",
			});
			expect(res.action).toBe("resume");
			if (res.action === "resume") {
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.currentStep).toBe(1);
			}
		});

		it("passes on /skill if another playbook is already active", () => {
			const res = resolveUserPrompt({
				prompt: "/other-skill",
				state: runningState,
				workspacePaths: ["/workspace"],
				harness: "claude",
			});
			expect(res).toEqual({ action: "pass", nextState: runningState });
		});

		it("nudges during paused intermission review", () => {
			const res = resolveUserPrompt({
				prompt: "what should I do?",
				state: pausedState,
				workspacePaths: ["/workspace"],
				harness: "claude",
			});
			expect(res.action).toBe("intermission_nudge");
			if (res.action === "intermission_nudge") {
				expect(res.message).toContain("Check tests");
			}
		});

		it("passes on regular input when running", () => {
			const res = resolveUserPrompt({
				prompt: "regular text",
				state: runningState,
				workspacePaths: ["/workspace"],
				harness: "claude",
			});
			expect(res).toEqual({ action: "pass", nextState: runningState });
		});
	});

	describe("guardBackstageRead", () => {
		it("blocks read targeting the active script", () => {
			const scriptPath = path.resolve("/workspace", runningState.script);
			const res = guardBackstageRead({
				readPath: scriptPath,
				state: runningState,
				workspacePaths: ["/workspace"],
			});
			expect(res.blocked).toBe(true);
			if (res.blocked) {
				expect(res.reason).toContain("BLOCKED BY CURTAIN");
			}
		});

		it("allows read targeting different file", () => {
			const res = guardBackstageRead({
				readPath: "/workspace/src/index.ts",
				state: runningState,
				workspacePaths: ["/workspace"],
			});
			expect(res).toEqual({ blocked: false });
		});
	});

	describe("guardSkillInvocation", () => {
		it("blocks curtain:next invocation", () => {
			const res = guardSkillInvocation({
				skillTarget: "curtain:next",
				state: runningState,
			});
			expect(res.blocked).toBe(true);
			if (res.blocked) {
				expect(res.reason).toContain("Only the user can advance execution");
			}
		});

		it("blocks re-invoking the active skill", () => {
			const res = guardSkillInvocation({
				skillTarget: "curtain-test",
				state: runningState,
			});
			expect(res.blocked).toBe(true);
			if (res.blocked) {
				expect(res.reason).toContain("Playbook execution is already active");
			}
		});

		it("allows invoking a different skill", () => {
			expect(
				guardSkillInvocation({
					skillTarget: "other-skill",
					state: runningState,
				}),
			).toEqual({ blocked: false });
		});
	});

	describe("resolveSkillInvocation", () => {
		it("resumes playbook when 'next' is invoked while paused", () => {
			const res = resolveSkillInvocation({
				skillName: "next",
				state: pausedState,
				workspacePaths: ["/workspace"],
				harness: "agy",
			});
			expect(res.action).toBe("resume");
			if (res.action === "resume") {
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.currentStep).toBe(1);
			}
		});

		it("blocks 'next' when state is null", () => {
			const res = resolveSkillInvocation({
				skillName: "next",
				state: null,
				workspacePaths: ["/workspace"],
				harness: "agy",
			});
			expect(res).toEqual({
				action: "block",
				message: "BLOCKED BY CURTAIN: No script is currently loaded.",
				nextState: null,
			});
		});

		it("blocks 'next' when state is running", () => {
			const res = resolveSkillInvocation({
				skillName: "next",
				state: runningState,
				workspacePaths: ["/workspace"],
				harness: "agy",
			});
			expect(res.action).toBe("block");
			if (res.action === "block") {
				expect(res.message).toContain("Only the user can advance execution");
			}
		});

		it("blocks re-invoking the active skill while running", () => {
			const res = resolveSkillInvocation({
				skillName: "curtain-test",
				state: runningState,
				workspacePaths: ["/workspace"],
				harness: "agy",
			});
			expect(res.action).toBe("block");
			if (res.action === "block") {
				expect(res.message).toContain("Playbook execution is already active");
			}
		});

		it("passes non-curtain skill when running", () => {
			const res = resolveSkillInvocation({
				skillName: "other-skill",
				state: runningState,
				workspacePaths: ["/workspace"],
				harness: "agy",
			});
			expect(res).toEqual({ action: "pass", nextState: runningState });
		});

		it("passes non-curtain skill when idle if no playbook found", () => {
			const res = resolveSkillInvocation({
				skillName: "non-existent-skill",
				state: null,
				workspacePaths: ["/workspace"],
				harness: "agy",
			});
			expect(res).toEqual({ action: "pass", nextState: null });
		});
	});
});
