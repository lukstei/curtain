import { describe, expect, it } from "vitest";
import { codexHarness } from "./codex.ts";
import type { NormalizedEvent } from "./types.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "codex",
		conversationId: "test-codex-conv",
		workspacePath: "/test/project",
		isStop: false,
		stopHookActive: false,
		isInterrupted: false,
		latestMessage: null,
		rawPayload: {},
		...overrides,
	};
}

describe("codexHarness", () => {
	describe("detect", () => {
		it("detects hookEventName in payload", () => {
			expect(codexHarness.detect({ hookEventName: "Stop" }, {})).toBe(true);
			expect(
				codexHarness.detect({ hookEventName: "UserPromptSubmit" }, {}),
			).toBe(true);
		});

		it("detects turn_id in payload", () => {
			expect(
				codexHarness.detect({ hook_event_name: "Stop", turn_id: "t-1" }, {}),
			).toBe(true);
		});

		it("detects CODEX_SESSION_ID in environment", () => {
			expect(codexHarness.detect({}, { CODEX_SESSION_ID: "session-123" })).toBe(
				true,
			);
		});

		it("detects PLUGIN_DATA in environment", () => {
			expect(codexHarness.detect({}, { PLUGIN_DATA: "/tmp/data" })).toBe(true);
		});

		it("returns false without hookEventName, turn_id, CODEX_SESSION_ID, or PLUGIN_DATA", () => {
			expect(codexHarness.detect({}, {})).toBe(false);
			expect(codexHarness.detect({}, { UNRELATED: "true" })).toBe(false);
		});
	});

	describe("normalize", () => {
		it("normalizes user prompt submit event", () => {
			const event = codexHarness.normalize({
				session_id: "codex-s1",
				cwd: "/codex/workspace",
				hook_event_name: "UserPromptSubmit",
				prompt: "/next",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "codex-s1",
				  "harness": "codex",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": {
				    "content": "/next",
				    "type": "USER_INPUT",
				  },
				  "prompt": "/next",
				  "rawPayload": {
				    "cwd": "/codex/workspace",
				    "hook_event_name": "UserPromptSubmit",
				    "prompt": "/next",
				    "session_id": "codex-s1",
				  },
				  "readTargetFilePath": null,
				  "stopHookActive": false,
				  "toolCall": null,
				  "type": "pre",
				  "workspacePath": "/codex/workspace",
				}
			`);
		});

		it("normalizes stop event", () => {
			const event = codexHarness.normalize({
				session_id: "codex-s1",
				cwd: "/codex/workspace",
				hook_event_name: "Stop",
			});
			expect(event.type).toBe("stop");
			expect(event.isStop).toBe(true);
		});

		it("normalizes tool event and extracts readTargetFilePath", () => {
			const event = codexHarness.normalize({
				session_id: "codex-s1",
				cwd: "/codex/workspace",
				hook_event_name: "PreToolUse",
				tool_name: "read_file",
				tool_input: { path: "/codex/workspace/SKILL.md" },
			});
			expect(event.type).toBe("tool");
			expect(event.readTargetFilePath).toBe("/codex/workspace/SKILL.md");
		});
	});

	describe("extractFileReadTarget", () => {
		it("extracts path for read_file", () => {
			const target = codexHarness.extractFileReadTarget?.(
				{ name: "read_file", args: { path: "/path/to/SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/path/to/SKILL.md");
		});

		it("resolves relative path for view_file", () => {
			const target = codexHarness.extractFileReadTarget?.(
				{ name: "view_file", args: { path: "SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/workspace/SKILL.md");
		});

		it("extracts path for mcp__filesystem__read_file", () => {
			const target = codexHarness.extractFileReadTarget?.(
				{
					name: "mcp__filesystem__read_file",
					args: { path: "/path/to/SKILL.md" },
				},
				"/workspace",
			);
			expect(target).toBe("/path/to/SKILL.md");
		});

		it("returns null for non-reading tools", () => {
			const target = codexHarness.extractFileReadTarget?.(
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
				rawPayload: { last_assistant_message: "Assistant response" },
			});
			const res = codexHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "PLANNER_RESPONSE",
				content: "Assistant response",
			});
		});

		it("extracts user prompt on pre", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "User question",
			});
			const res = codexHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "USER_INPUT",
				content: "User question",
			});
		});

		it("returns null when neither is present", () => {
			const event = createMockEvent({ type: "pre", prompt: undefined });
			expect(codexHarness.extractLatestMessage(event)).toBeNull();
		});
	});

	describe("formatEgress", () => {
		it("formats Stop continue decision as block", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = codexHarness.formatEgress(event, {
				decision: "continue",
				reason: "Execute step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "block",
				  "reason": "Execute step 2",
				  "suppressOutput": true,
				}
			`);
		});

		it("formats Stop allow decision as empty JSON", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = codexHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});

		it("formats UserPromptSubmit injection with hookSpecificOutput", () => {
			const event = createMockEvent({ type: "pre" });
			const egress = codexHarness.formatEgress(event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "hookSpecificOutput": {
				    "additionalContext": "Instruction for step 1",
				    "hookEventName": "UserPromptSubmit",
				  },
				  "suppressOutput": true,
				  "systemMessage": "[CURTAIN]",
				}
			`);
		});

		it("formats PreToolUse deny as permissionDecision deny", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = codexHarness.formatEgress(event, {
				decision: "deny",
				reason: "Blocked by Curtain",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "hookSpecificOutput": {
				    "hookEventName": "PreToolUse",
				    "permissionDecision": "deny",
				    "permissionDecisionReason": "Blocked by Curtain",
				  },
				}
			`);
		});

		it("formats PreToolUse allow as empty JSON", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = codexHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});
	});

	describe("getSkillDirs", () => {
		it("returns generic and Codex skill directories", () => {
			const dirs = codexHarness.getSkillDirs?.("/workspace", {
				HOME: "/home/user",
			});
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.codex/skills",
				"/workspace/.codex/plugins",
				"/home/user/.codex/skills",
				"/home/user/.codex/plugins/cache",
				"/home/user/.codex/plugins/marketplaces",
			]);
		});
	});
});
