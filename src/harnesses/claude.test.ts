import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunnerState } from "../state.ts";
import { claudeHarness } from "./claude.ts";

describe("claudeHarness", () => {
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
		it("detects hook_event_name in payload", () => {
			expect(claudeHarness.detect({ hook_event_name: "Stop" }, {})).toBe(true);
		});

		it("detects CLAUDE_CODE_SESSION_ID in environment", () => {
			expect(
				claudeHarness.detect({}, { CLAUDE_CODE_SESSION_ID: "session-123" }),
			).toBe(true);
		});

		it("detects CLAUDE_PLUGIN_DATA in environment", () => {
			expect(
				claudeHarness.detect({}, { CLAUDE_PLUGIN_DATA: "/path/to/data" }),
			).toBe(true);
		});

		it("returns false without hook_event_name or environment variables", () => {
			expect(claudeHarness.detect({}, {})).toBe(false);
			expect(claudeHarness.detect({ session_id: "s1" }, {})).toBe(false);
		});
	});

	describe("resolveConversationId", () => {
		it("resolves from payload session_id", () => {
			expect(
				claudeHarness.resolveConversationId(
					{ session_id: "claude-session-1" },
					{},
				),
			).toBe("claude-session-1");
		});

		it("resolves from env CLAUDE_CODE_SESSION_ID", () => {
			expect(
				claudeHarness.resolveConversationId(
					{},
					{ CLAUDE_CODE_SESSION_ID: "env-session" },
				),
			).toBe("env-session");
		});

		it("falls back to default", () => {
			expect(claudeHarness.resolveConversationId({}, {})).toBe("default");
		});
	});

	describe("handle", () => {
		describe("session_start (pre mode without prompt)", () => {
			it("returns empty egress and preserves state", () => {
				const res = claudeHarness.handle(
					{ hook_event_name: "SessionStart", cwd: "/workspace" },
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
		});

		describe("prompt (pre mode with prompt)", () => {
			it("blocks /next with exit code 2 when no playbook is loaded", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "UserPromptSubmit",
						prompt: "/next",
						cwd: "/workspace",
					},
					{
						conversationId: "c1",
						state: null,
						mode: "pre",
						env: {},
					},
				);
				expect(res.egress).toEqual({
					exitCode: 2,
					stderr: "BLOCKED BY CURTAIN: No script is currently loaded.",
				});
				expect(res.nextState).toBeNull();
			});

			it("resumes paused playbook on /next with exit code 0 and context injection", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "UserPromptSubmit",
						prompt: "/next",
						cwd: "/workspace",
					},
					{
						conversationId: "c1",
						state: pausedState,
						mode: "pre",
						env: {},
					},
				);
				expect(res.egress.exitCode).toBe(0);
				const out = JSON.parse(res.egress.stdout ?? "{}");
				expect(out).toEqual({
					hookSpecificOutput: {
						hookEventName: "UserPromptSubmit",
						additionalContext: expect.stringContaining("Step 2"),
					},
				});
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.currentStep).toBe(1);
			});

			it("nudges on regular conversational text during paused review", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "UserPromptSubmit",
						prompt: "what should I do?",
						cwd: "/workspace",
					},
					{
						conversationId: "c1",
						state: pausedState,
						mode: "pre",
						env: {},
					},
				);
				expect(res.egress.exitCode).toBe(0);
				const out = JSON.parse(res.egress.stdout ?? "{}");
				expect(out).toEqual({
					hookSpecificOutput: {
						hookEventName: "UserPromptSubmit",
						additionalContext: expect.stringContaining("Check tests"),
					},
				});
				expect(res.nextState).toBe(pausedState);
			});

			it("passes through on regular text when running", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "UserPromptSubmit",
						prompt: "just normal question",
						cwd: "/workspace",
					},
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

			it("starts playbook on skill slash command", () => {
				const examplesDir = path.resolve(import.meta.dirname, "../../examples");
				const res = claudeHarness.handle(
					{
						hook_event_name: "UserPromptSubmit",
						prompt: "/curtain-test",
						cwd: examplesDir,
					},
					{
						conversationId: "c1",
						state: null,
						mode: "pre",
						env: {},
					},
				);
				expect(res.egress.exitCode).toBe(0);
				const out = JSON.parse(res.egress.stdout ?? "{}");
				expect(out).toEqual({
					hookSpecificOutput: {
						hookEventName: "UserPromptSubmit",
						additionalContext: expect.stringContaining("Step 1"),
					},
				});
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.skillName).toBe("curtain-test");
				expect(res.nextState?.currentStep).toBe(0);
			});
		});

		describe("stop", () => {
			it("advances turn and continues loop with exit code 0 and context injection", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "Stop",
						cwd: "/workspace",
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
				expect(out).toEqual({
					hookSpecificOutput: {
						hookEventName: "Stop",
						additionalContext: expect.stringContaining("Step 2"),
					},
				});
				expect(res.nextState?.currentStep).toBe(1);
			});

			it("allows turn to conclude when paused", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "Stop",
						cwd: "/workspace",
					},
					{
						conversationId: "c1",
						state: pausedState,
						mode: "stop",
						env: {},
					},
				);
				expect(res.egress).toEqual({ exitCode: 0, stdout: "{}" });
				expect(res.nextState).toBe(pausedState);
			});

			it("allows turn to conclude when state is null", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "Stop",
						cwd: "/workspace",
					},
					{
						conversationId: "c1",
						state: null,
						mode: "stop",
						env: {},
					},
				);
				expect(res.egress).toEqual({ exitCode: 0, stdout: "{}" });
				expect(res.nextState).toBeNull();
			});
		});

		describe("tool", () => {
			it("allows unmonitored tool calls to proceed unimpeded", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: "/workspace",
						tool_name: "Bash",
						tool_input: { command: "npm test" },
					},
					{
						conversationId: "c1",
						state: runningState,
						mode: "tool",
						env: {},
					},
				);
				expect(res.egress).toEqual({ exitCode: 0, stdout: "{}" });
				expect(res.nextState).toBe(runningState);
			});

			it("blocks Skill tool call targeting curtain:next with exit code 2", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: "/workspace",
						tool_name: "Skill",
						tool_input: { skill: "curtain:next" },
					},
					{
						conversationId: "c1",
						state: runningState,
						mode: "tool",
						env: {},
					},
				);
				expect(res.egress.exitCode).toBe(2);
				expect(res.egress.stderr).toContain(
					"Only the user can advance execution by typing /next",
				);
				expect(res.nextState).toBe(runningState);
			});

			it("blocks Skill tool call re-invoking active skill with exit code 2", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: "/workspace",
						tool_name: "Skill",
						tool_input: { skill: "$curtain-test" },
					},
					{
						conversationId: "c1",
						state: runningState,
						mode: "tool",
						env: {},
					},
				);
				expect(res.egress.exitCode).toBe(2);
				expect(res.egress.stderr).toContain(
					"Playbook execution is already active",
				);
				expect(res.nextState).toBe(runningState);
			});

			it("intercepts Skill tool call starting a new playbook with exit code 2", () => {
				const examplesDir = path.resolve(import.meta.dirname, "../../examples");
				const res = claudeHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: examplesDir,
						tool_name: "Skill",
						tool_input: { skill: "curtain-test" },
					},
					{
						conversationId: "c1",
						state: null,
						mode: "tool",
						env: {},
					},
				);
				expect(res.egress.exitCode).toBe(2);
				expect(res.egress.stderr).toContain("Step 1");
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.skillName).toBe("curtain-test");
				expect(res.nextState?.currentStep).toBe(0);
			});

			it("blocks file read targeting active backstage playbook script with exit code 2", () => {
				const scriptPath = path.resolve("/workspace", runningState.script);
				const res = claudeHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: "/workspace",
						tool_name: "Read",
						tool_input: { file_path: scriptPath },
					},
					{
						conversationId: "c1",
						state: runningState,
						mode: "tool",
						env: {},
					},
				);
				expect(res.egress.exitCode).toBe(2);
				expect(res.egress.stderr).toContain(
					"BLOCKED BY CURTAIN: You are executing this skill behind curtains",
				);
				expect(res.nextState).toBe(runningState);
			});

			it("allows benign file read", () => {
				const res = claudeHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: "/workspace",
						tool_name: "Read",
						tool_input: { file_path: "/workspace/src/index.ts" },
					},
					{
						conversationId: "c1",
						state: runningState,
						mode: "tool",
						env: {},
					},
				);
				expect(res.egress).toEqual({ exitCode: 0, stdout: "{}" });
				expect(res.nextState).toBe(runningState);
			});
		});
	});

	describe("getSkillDirs", () => {
		it("returns generic and Claude skill directories", () => {
			const home = os.homedir();
			const dirs = claudeHarness.getSkillDirs(["/workspace"]);
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.claude/skills",
				"/workspace/.claude/plugins",
				path.join(home, ".claude/skills"),
				path.join(home, ".claude/plugins/marketplaces"),
				path.join(home, ".claude/plugins/cache"),
			]);
		});

		it("includes CLAUDE_PLUGIN_ROOT when defined in environment", () => {
			const original = process.env.CLAUDE_PLUGIN_ROOT;
			try {
				process.env.CLAUDE_PLUGIN_ROOT = "/opt/claude-plugin";
				const dirs = claudeHarness.getSkillDirs(["/workspace"]);
				expect(dirs).toContain("/opt/claude-plugin/skills");
			} finally {
				if (original === undefined) {
					delete process.env.CLAUDE_PLUGIN_ROOT;
				} else {
					process.env.CLAUDE_PLUGIN_ROOT = original;
				}
			}
		});
	});
});
