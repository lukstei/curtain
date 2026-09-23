import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { copilotHarness } from "./copilot.ts";
import type { NormalizedEvent } from "./types.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "copilot",
		conversationId: "test-copilot-conv",
		workspacePath: "/test/project",
		prompt: "",
		latestMessage: null,
		rawPayload: {},
		...overrides,
	} as NormalizedEvent;
}

describe("copilotHarness", () => {
	describe("detect", () => {
		it("detects COPILOT_PLUGIN_DATA", () => {
			expect(
				copilotHarness.detect({}, { COPILOT_PLUGIN_DATA: "/tmp/copilot" }),
			).toBe(true);
		});

		it("detects COPILOT_SESSION_ID", () => {
			expect(
				copilotHarness.detect({}, { COPILOT_SESSION_ID: "session-123" }),
			).toBe(true);
		});

		it("detects timestamp in payload", () => {
			expect(
				copilotHarness.detect(
					{
						timestamp: "2026-09-23T22:00:00Z",
						hook_event_name: "PreToolUse",
					},
					{},
				),
			).toBe(true);
		});

		it("returns false without COPILOT_PLUGIN_DATA, COPILOT_SESSION_ID, or timestamp", () => {
			expect(copilotHarness.detect({}, {})).toBe(false);
		});
	});

	describe("normalize", () => {
		it("normalizes pre event with prompt", () => {
			const event = copilotHarness.normalize({
				conversationId: "copilot-c1",
				cwd: "/copilot/workspace",
				prompt: "/next",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "copilot-c1",
				  "harness": "copilot",
				  "latestMessage": {
				    "content": "/next",
				    "type": "USER_INPUT",
				  },
				  "prompt": "/next",
				  "rawPayload": {
				    "conversationId": "copilot-c1",
				    "cwd": "/copilot/workspace",
				    "prompt": "/next",
				  },
				  "type": "pre",
				  "workspacePath": "/copilot/workspace",
				}
			`);
		});

		it("normalizes stop event", () => {
			const event = copilotHarness.normalize({
				conversationId: "copilot-c1",
				cwd: "/copilot/workspace",
				hook_event_name: "Stop",
			});
			assert(event.type === "stop");
			expect(event.isStop).toBe(true);
		});

		it("normalizes tool event and extracts readTargetFilePath", () => {
			const event = copilotHarness.normalize({
				conversationId: "copilot-c1",
				cwd: "/copilot/workspace",
				hook_event_name: "preToolUse",
				tool_name: "read_file",
				tool_input: { path: "/copilot/workspace/SKILL.md" },
			});
			assert(event.type === "tool");
			expect(event.readTargetFilePath).toBe("/copilot/workspace/SKILL.md");
		});
	});

	describe("extractFileReadTarget", () => {
		it("extracts path for read_file", () => {
			const target = copilotHarness.extractFileReadTarget?.(
				{ name: "read_file", args: { path: "/path/to/SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/path/to/SKILL.md");
		});

		it("resolves relative path for view_file", () => {
			const target = copilotHarness.extractFileReadTarget?.(
				{ name: "view_file", args: { file_path: "SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/workspace/SKILL.md");
		});

		it("returns null for non-reading tools", () => {
			const target = copilotHarness.extractFileReadTarget?.(
				{ name: "Bash", args: { command: "ls" } },
				"/workspace",
			);
			expect(target).toBeNull();
		});
	});

	describe("extractLatestMessage", () => {
		it("extracts prompt on pre", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "/next",
			});
			const res = copilotHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "USER_INPUT",
				content: "/next",
			});
		});

		it("extracts last_assistant_message on stop", () => {
			const event = createMockEvent({
				type: "stop",
				rawPayload: { last_assistant_message: "Copilot response" },
			});
			const res = copilotHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "PLANNER_RESPONSE",
				content: "Copilot response",
			});
		});

		it("returns null when no prompt and no assistant message", () => {
			const event = createMockEvent({ type: "stop" });
			expect(copilotHarness.extractLatestMessage(event)).toBeNull();
		});
	});

	describe("formatEgress", () => {
		it("formats Stop continue decision as block", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = copilotHarness.formatEgress(event, {
				decision: "continue",
				reason: "Step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "block",
				  "hookSpecificOutput": {
				    "decision": "block",
				    "hookEventName": "Stop",
				    "reason": "Step 2",
				  },
				  "reason": "Step 2",
				}
			`);
		});

		it("formats Stop allow decision as empty JSON", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = copilotHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});

		it("formats PreToolUse deny decision", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = copilotHarness.formatEgress(event, {
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
				  "permissionDecision": "deny",
				  "permissionDecisionReason": "Blocked by Curtain",
				}
			`);
		});

		it("formats PreToolUse allow decision", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = copilotHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "hookSpecificOutput": {
				    "hookEventName": "PreToolUse",
				    "permissionDecision": "allow",
				  },
				  "permissionDecision": "allow",
				}
			`);
		});

		it("formats PreInvocation with additionalContext", () => {
			const event = createMockEvent({ type: "pre" });
			const egress = copilotHarness.formatEgress(event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "additionalContext": "Instruction for step 1",
				}
			`);
		});
	});

	describe("getSkillDirs", () => {
		it("returns generic and Copilot skill directories", () => {
			const dirs = copilotHarness.getSkillDirs?.("/workspace", {
				HOME: "/home/user",
			});
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.github/skills",
				"/workspace/.claude/skills",
				"/home/user/.copilot/skills",
				"/home/user/.claude/skills",
				"/home/user/.agents/skills",
			]);
		});
	});
});
