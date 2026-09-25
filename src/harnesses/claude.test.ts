import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { claudeHarness } from "./claude.ts";
import type { NormalizedEvent } from "./types.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "claude",
		conversationId: "test-claude-conv",
		workspacePath: "/test/project",
		prompt: "",
		latestMessage: null,
		rawPayload: {},
		...overrides,
	} as NormalizedEvent;
}

describe("claudeHarness", () => {
	describe("detect", () => {
		it("detects hook_event_name in payload", () => {
			expect(claudeHarness.detect({ hook_event_name: "Stop" }, {})).toBe(true);
		});

		it("detects CLAUDE_CODE_SESSION_ID in environment", () => {
			expect(
				claudeHarness.detect({}, { CLAUDE_CODE_SESSION_ID: "session-123" }),
			).toBe(true);
		});

		it("returns false without hook_event_name or CLAUDE_CODE_SESSION_ID", () => {
			expect(claudeHarness.detect({}, {})).toBe(false);
			expect(claudeHarness.detect({ session_id: "s1" }, {})).toBe(false);
		});
	});

	describe("normalize", () => {
		it("normalizes user prompt submit event", () => {
			const event = claudeHarness.normalize({
				session_id: "claude-s1",
				cwd: "/claude/workspace",
				hook_event_name: "UserPromptSubmit",
				prompt: "/next",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "claude-s1",
				  "harness": "claude",
				  "latestMessage": {
				    "content": "/next",
				    "type": "USER_INPUT",
				  },
				  "prompt": "/next",
				  "rawPayload": {
				    "cwd": "/claude/workspace",
				    "hook_event_name": "UserPromptSubmit",
				    "prompt": "/next",
				    "session_id": "claude-s1",
				  },
				  "type": "pre",
				  "workspacePath": "/claude/workspace",
				}
			`);
		});

		it("normalizes stop event", () => {
			const event = claudeHarness.normalize({
				session_id: "claude-s1",
				cwd: "/claude/workspace",
				hook_event_name: "Stop",
			});
			assert(event.type === "stop");
			expect(event.isStop).toBe(true);
		});

		it("normalizes tool event and extracts readTargetFilePath", () => {
			const event = claudeHarness.normalize({
				session_id: "claude-s1",
				cwd: "/claude/workspace",
				hook_event_name: "PreToolUse",
				tool_name: "View",
				tool_input: { file_path: "/claude/workspace/SKILL.md" },
			});
			assert(event.type === "tool");
			expect(event.readTargetFilePath).toBe("/claude/workspace/SKILL.md");
		});
	});

	describe("extractFileReadTarget", () => {
		it("extracts file_path for Read", () => {
			const target = claudeHarness.extractFileReadTarget?.(
				{ name: "Read", args: { file_path: "/path/to/SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/path/to/SKILL.md");
		});

		it("extracts file_path for View", () => {
			const target = claudeHarness.extractFileReadTarget?.(
				{ name: "View", args: { file_path: "/path/to/SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/path/to/SKILL.md");
		});

		it("resolves relative path for read_file", () => {
			const target = claudeHarness.extractFileReadTarget?.(
				{ name: "read_file", args: { file_path: "SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/workspace/SKILL.md");
		});

		it("extracts path for mcp__filesystem__read_file", () => {
			const target = claudeHarness.extractFileReadTarget?.(
				{
					name: "mcp__filesystem__read_file",
					args: { path: "/path/to/SKILL.md" },
				},
				"/workspace",
			);
			expect(target).toBe("/path/to/SKILL.md");
		});

		it("returns null for non-reading tools", () => {
			const target = claudeHarness.extractFileReadTarget?.(
				{ name: "Bash", args: { command: "ls" } },
				"/workspace",
			);
			expect(target).toBeNull();
		});
	});

	describe("extractLatestMessage", () => {
		it("extracts last_assistant_message on stop", () => {
			const event = createMockEvent({
				type: "stop",
				isStop: true,
				rawPayload: { last_assistant_message: "Claude answer" },
			});
			const res = claudeHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "PLANNER_RESPONSE",
				content: "Claude answer",
			});
		});

		it("extracts user prompt on pre", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "/next",
			});
			const res = claudeHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "USER_INPUT",
				content: "/next",
			});
		});
	});

	describe("formatEgress", () => {
		it("formats Stop continue decision as block", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = claudeHarness.formatEgress(event, {
				action: "continue",
				reason: "Execute step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "block",
				  "reason": "Execute step 2",
				}
			`);
		});

		it("formats Stop allow decision as empty JSON", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = claudeHarness.formatEgress(event, { action: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});

		it("formats UserPromptSubmit injection with hookSpecificOutput", () => {
			const event = createMockEvent({ type: "pre" });
			const egress = claudeHarness.formatEgress(event, {
				action: "inject",
				message: "Instruction for step 1",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "hookSpecificOutput": {
				    "additionalContext": "Instruction for step 1",
				    "hookEventName": "UserPromptSubmit",
				  },
				}
			`);
		});

		it("formats PreToolUse deny as exitCode 2 with stderr", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = claudeHarness.formatEgress(event, {
				action: "deny",
				reason: "Blocked by Curtain",
			});
			expect(egress.exitCode).toBe(2);
			expect(egress.stderr).toBe("Blocked by Curtain");
		});

		it("formats PreToolUse allow as exitCode 0 with empty stdout", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = claudeHarness.formatEgress(event, { action: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});
	});

	describe("getSkillDirs", () => {
		it("returns generic and Claude skill directories", () => {
			const dirs = claudeHarness.getSkillDirs?.("/workspace", {
				HOME: "/home/user",
				CLAUDE_PLUGIN_ROOT: "/opt/curtain",
			});
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.claude/skills",
				"/workspace/.claude/plugins",
				"/home/user/.claude/skills",
				"/home/user/.claude/plugins/marketplaces",
				"/home/user/.claude/plugins/cache",
				"/opt/curtain/skills",
			]);
		});
	});

	describe("extractSkillTarget", () => {
		it("extracts skill target from Skill tool call", () => {
			expect(
				claudeHarness.extractSkillTarget?.({
					name: "Skill",
					args: { skill: "curtain:next" },
				}),
			).toBe("curtain:next");

			expect(
				claudeHarness.extractSkillTarget?.({
					name: "Skill",
					args: { skill: "curtain-test" },
				}),
			).toBe("curtain-test");
		});

		it("returns null for non-Skill tool calls", () => {
			expect(
				claudeHarness.extractSkillTarget?.({
					name: "Read",
					args: { file_path: "foo.md" },
				}),
			).toBeNull();
		});
	});
});
