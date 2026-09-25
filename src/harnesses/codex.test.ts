import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import {
	codexHarness,
	extractCodexSkillPath,
	parseCodexMessage,
} from "./codex.ts";
import type { NormalizedEvent } from "./types.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "codex",
		conversationId: "test-codex-conv",
		workspacePath: "/test/project",
		prompt: "",
		latestMessage: null,
		rawPayload: {},
		...overrides,
	} as NormalizedEvent;
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
			assert(event.type === "stop");
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
			assert(event.type === "tool");
			expect(event.readTargetFilePath).toBe("/codex/workspace/SKILL.md");
		});

		it("normalizes user prompt with Markdown skill link and extracts skillInvocationPath", () => {
			const event = codexHarness.normalize({
				session_id: "codex-s1",
				cwd: "/codex/workspace",
				hook_event_name: "UserPromptSubmit",
				prompt: "[$curtain-test](/codex/workspace/SKILL.md) \n",
			});
			assert(event.type === "pre");
			expect(event.skillInvocationPath).toBe("/codex/workspace/SKILL.md");
		});

		it("normalizes user prompt with xml skill block and extracts skillInvocationPath", () => {
			const event = codexHarness.normalize({
				session_id: "codex-s1",
				cwd: "/codex/workspace",
				hook_event_name: "UserPromptSubmit",
				prompt: "<skill><path>/codex/workspace/SKILL.md</path></skill>",
			});
			assert(event.type === "pre");
			expect(event.skillInvocationPath).toBe("/codex/workspace/SKILL.md");
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

		it("extracts path for Read and View", () => {
			expect(
				codexHarness.extractFileReadTarget?.(
					{ name: "Read", args: { file_path: "/path/to/SKILL.md" } },
					"/workspace",
				),
			).toBe("/path/to/SKILL.md");
			expect(
				codexHarness.extractFileReadTarget?.(
					{ name: "View", args: { path: "/path/to/SKILL.md" } },
					"/workspace",
				),
			).toBe("/path/to/SKILL.md");
		});

		it("extracts path for mcp filesystem tools", () => {
			expect(
				codexHarness.extractFileReadTarget?.(
					{
						name: "mcp__filesystem__read_file",
						args: { path: "/path/to/SKILL.md" },
					},
					"/workspace",
				),
			).toBe("/path/to/SKILL.md");
			expect(
				codexHarness.extractFileReadTarget?.(
					{
						name: "mcp__fs__view_file",
						args: { AbsolutePath: "/path/to/SKILL.md" },
					},
					"/workspace",
				),
			).toBe("/path/to/SKILL.md");
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

	describe("parseCodexMessage", () => {
		it("parses assistant response item", () => {
			const item = {
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "Assistant response" }],
				},
			};
			expect(parseCodexMessage(item)).toEqual({
				type: "PLANNER_RESPONSE",
				content: "Assistant response",
			});
		});

		it("parses user response item", () => {
			const item = {
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "User prompt" }],
				},
			};
			expect(parseCodexMessage(item)).toEqual({
				type: "USER_INPUT",
				content: "User prompt",
			});
		});

		it("returns null for non-message items", () => {
			expect(parseCodexMessage({ type: "event_msg" })).toBeNull();
			expect(
				parseCodexMessage({
					type: "response_item",
					payload: { type: "other" },
				}),
			).toBeNull();
		});
	});

	describe("extractSkillTarget", () => {
		it("extracts target from Skill or invoke_skill tool calls", () => {
			expect(
				codexHarness.extractSkillTarget?.({
					name: "Skill",
					args: { skill: "curtain:next" },
				}),
			).toBe("curtain:next");

			expect(
				codexHarness.extractSkillTarget?.({
					name: "invoke_skill",
					args: { name: "curtain-test" },
				}),
			).toBe("curtain-test");
		});

		it("returns null for non-skill tool calls", () => {
			expect(
				codexHarness.extractSkillTarget?.({
					name: "read_file",
					args: { path: "foo.md" },
				}),
			).toBeNull();
		});
	});
});
