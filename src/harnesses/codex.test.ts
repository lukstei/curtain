import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunnerState } from "../state.ts";
import {
	ANGLE_BRACKET_ENCLOSURE_REGEX,
	codexHarness,
	extractCodexSkillPath,
	SKILL_LINK_PATH_CAPTURE_REGEX,
	XML_SKILL_PATH_REGEX,
} from "./codex.ts";

describe("codexHarness", () => {
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
		it("detects CODEX_SESSION_ID in environment", () => {
			expect(codexHarness.detect({}, { CODEX_SESSION_ID: "session-1" })).toBe(
				true,
			);
		});

		it("detects PLUGIN_DATA in environment", () => {
			expect(codexHarness.detect({}, { PLUGIN_DATA: "/path" })).toBe(true);
		});

		it("does not detect from payload fields without environment", () => {
			expect(codexHarness.detect({ turn_id: "turn-1" }, {})).toBe(false);
			expect(codexHarness.detect({ hook_event_name: "PreToolUse" }, {})).toBe(
				false,
			);
			expect(codexHarness.detect({}, {})).toBe(false);
		});
	});

	describe("resolveConversationId", () => {
		it("resolves from session_id", () => {
			expect(
				codexHarness.resolveConversationId({ session_id: "codex-1" }, {}),
			).toBe("codex-1");
		});

		it("resolves from env CODEX_SESSION_ID", () => {
			expect(
				codexHarness.resolveConversationId(
					{},
					{ CODEX_SESSION_ID: "env-codex" },
				),
			).toBe("env-codex");
		});

		it("falls back to default", () => {
			expect(codexHarness.resolveConversationId({}, {})).toBe("default");
		});
	});

	describe("handle", () => {
		describe("session_start (pre mode without prompt)", () => {
			it("returns empty egress and preserves state", () => {
				const res = codexHarness.handle(
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
			it("blocks /next when no playbook is loaded", () => {
				const res = codexHarness.handle(
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
				expect(res.egress.exitCode).toBe(0);
				const out = JSON.parse(res.egress.stdout ?? "{}");
				expect(out).toEqual({
					decision: "block",
					reason: "BLOCKED BY CURTAIN: No script is currently loaded.",
				});
				expect(res.nextState).toBeNull();
			});

			it("resumes paused playbook on /next", () => {
				const res = codexHarness.handle(
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
				expect(out.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
				expect(out.hookSpecificOutput.additionalContext).toContain("Step 2");
				expect(out.systemMessage).toBe("[CURTAIN]");
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.currentStep).toBe(1);
			});

			it("nudges on regular conversational text during paused review", () => {
				const res = codexHarness.handle(
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
				expect(out.hookSpecificOutput.additionalContext).toContain(
					"Check tests",
				);
				expect(res.nextState).toBe(pausedState);
			});

			it("passes through on regular text when running", () => {
				const res = codexHarness.handle(
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

			it("starts playbook on skill prompt mention", () => {
				const examplesDir = path.resolve(import.meta.dirname, "../../examples");
				const res = codexHarness.handle(
					{
						hook_event_name: "UserPromptSubmit",
						prompt: "[$curtain-test](.agents/skills/curtain-test/SKILL.md)",
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
				expect(out.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
				expect(out.hookSpecificOutput.additionalContext).toContain("Step 1");
				expect(out.systemMessage).toBe("[CURTAIN]");
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.skillName).toBe("curtain-test");
				expect(res.nextState?.currentStep).toBe(0);
			});
		});

		describe("stop", () => {
			it("advances turn and returns continue block decision when running", () => {
				const res = codexHarness.handle(
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
					decision: "block",
					reason: expect.stringContaining("Step 2"),
					suppressOutput: true,
				});
				expect(res.nextState?.currentStep).toBe(1);
			});

			it("allows turn to conclude when paused", () => {
				const res = codexHarness.handle(
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
				const res = codexHarness.handle(
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

			it("allows turn to conclude when aborted or cancelled", () => {
				const res = codexHarness.handle(
					{
						hook_event_name: "Stop",
						cwd: "/workspace",
						terminationReason: "user cancelled turn",
					},
					{
						conversationId: "c1",
						state: runningState,
						mode: "stop",
						env: {},
					},
				);
				expect(res.egress).toEqual({ exitCode: 0, stdout: "{}" });
				expect(res.nextState).toBe(runningState);
			});
		});

		describe("tool", () => {
			it("allows unmonitored tool calls to proceed unimpeded", () => {
				const res = codexHarness.handle(
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

			it("blocks Skill tool call targeting curtain:next while running", () => {
				const res = codexHarness.handle(
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
				expect(res.egress.exitCode).toBe(0);
				const out = JSON.parse(res.egress.stdout ?? "{}");
				expect(out).toEqual({
					hookSpecificOutput: {
						hookEventName: "PreToolUse",
						permissionDecision: "deny",
						permissionDecisionReason: expect.stringContaining(
							"Only the user can advance execution by typing /next",
						),
					},
				});
				expect(res.nextState).toBe(runningState);
			});

			it("blocks Skill tool call re-invoking active skill", () => {
				const res = codexHarness.handle(
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
				expect(res.egress.exitCode).toBe(0);
				const out = JSON.parse(res.egress.stdout ?? "{}");
				expect(out).toEqual({
					hookSpecificOutput: {
						hookEventName: "PreToolUse",
						permissionDecision: "deny",
						permissionDecisionReason: expect.stringContaining(
							"Playbook execution is already active",
						),
					},
				});
				expect(res.nextState).toBe(runningState);
			});

			it("blocks file read targeting active backstage playbook script", () => {
				const scriptPath = path.resolve("/workspace", runningState.script);
				const res = codexHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: "/workspace",
						tool_name: "read_file",
						tool_input: { path: scriptPath },
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
				expect(out).toEqual({
					hookSpecificOutput: {
						hookEventName: "PreToolUse",
						permissionDecision: "deny",
						permissionDecisionReason:
							expect.stringContaining("BLOCKED BY CURTAIN"),
					},
				});
				expect(res.nextState).toBe(runningState);
			});

			it("allows file read targeting regular source files", () => {
				const res = codexHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: "/workspace",
						tool_name: "read_file",
						tool_input: { path: "src/index.ts" },
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

			it("intercepts and starts playbook on Skill tool call", () => {
				const examplesDir = path.resolve(import.meta.dirname, "../../examples");
				const res = codexHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: examplesDir,
						tool_name: "Skill",
						tool_input: { skill: "$curtain-test" },
					},
					{
						conversationId: "c1",
						state: null,
						mode: "tool",
						env: {},
					},
				);
				expect(res.egress.exitCode).toBe(0);
				const out = JSON.parse(res.egress.stdout ?? "{}");
				expect(out).toEqual({
					hookSpecificOutput: {
						hookEventName: "PreToolUse",
						permissionDecision: "deny",
						permissionDecisionReason: expect.stringContaining("Step 1"),
					},
				});
				expect(res.nextState?.status).toBe("running");
				expect(res.nextState?.skillName).toBe("curtain-test");
				expect(res.nextState?.currentStep).toBe(0);
			});

			it("blocks mcp read_file targeting active backstage script", () => {
				const scriptPath = path.resolve("/workspace", runningState.script);
				const res = codexHarness.handle(
					{
						hook_event_name: "PreToolUse",
						cwd: "/workspace",
						tool_name: "mcp__filesystem__read_file",
						tool_input: { path: scriptPath },
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
				expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
				expect(out.hookSpecificOutput.permissionDecisionReason).toContain(
					"BLOCKED BY CURTAIN",
				);
				expect(res.nextState).toBe(runningState);
			});
		});
	});

	describe("extractCodexSkillPath", () => {
		it("extracts path from markdown link with dollar prefix", () => {
			expect(
				extractCodexSkillPath(
					"[$curtain-test](/path/to/SKILL.md)",
					"/workspace",
				),
			).toBe("/path/to/SKILL.md");
		});

		it("extracts path from markdown link without dollar prefix", () => {
			expect(
				extractCodexSkillPath(
					"[curtain-test](skills/test/SKILL.md)",
					"/workspace",
				),
			).toBe("/workspace/skills/test/SKILL.md");
		});

		it("extracts path from xml skill block", () => {
			expect(
				extractCodexSkillPath(
					"<skill>\n<path>/path/to/SKILL.md</path>\n</skill>",
					"/workspace",
				),
			).toBe("/path/to/SKILL.md");
		});

		it("returns undefined for non-skill prompts", () => {
			expect(
				extractCodexSkillPath("just a regular question", "/workspace"),
			).toBeUndefined();
		});
	});

	describe("Regular Expressions", () => {
		it("captures skill link and path within text", () => {
			const text =
				"Please review [$curtain](plugins/curtain/skills/curtain/SKILL.md) before starting.";
			const match = text.match(SKILL_LINK_PATH_CAPTURE_REGEX);

			expect(match ? { name: match[1], path: match[2] } : null).toEqual({
				name: "curtain",
				path: "plugins/curtain/skills/curtain/SKILL.md",
			});
		});

		it("extracts skill path from XML block", () => {
			const xml =
				"<skill>\n  <name>curtain-test</name>\n  <path>/home/user/skills/curtain-test/SKILL.md</path>\n</skill>";
			const match = xml.match(XML_SKILL_PATH_REGEX);

			expect(match ? match[1] : null).toBe(
				"/home/user/skills/curtain-test/SKILL.md",
			);
		});

		it("strips enclosing angle brackets from path strings", () => {
			const paths = [
				"<path/to/file.md>",
				"path/to/file.md",
				"<only_start",
				"only_end>",
			];

			expect(
				paths.map((p) => p.replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "")),
			).toEqual([
				"path/to/file.md",
				"path/to/file.md",
				"only_start",
				"only_end",
			]);
		});
	});

	describe("getSkillDirs", () => {
		it("returns Codex skill directories", () => {
			const home = os.homedir();
			const dirs = codexHarness.getSkillDirs(["/workspace"]);
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.codex/skills",
				"/workspace/.codex/plugins",
				path.join(home, ".codex/skills"),
				path.join(home, ".codex/plugins/cache"),
				path.join(home, ".codex/plugins/marketplaces"),
			]);
		});
	});
});
