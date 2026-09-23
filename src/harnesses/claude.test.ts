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
		isStop: false,
		stopHookActive: false,
		isInterrupted: false,
		latestMessage: null,
		rawPayload: {},
		...overrides,
	};
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
				  "isInterrupted": false,
				  "isStop": false,
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
				  "stopHookActive": false,
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
			expect(event.type).toBe("stop");
			expect(event.isStop).toBe(true);
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
				decision: "continue",
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
			const egress = claudeHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
		});

		it("formats UserPromptSubmit injection with hookSpecificOutput", () => {
			const event = createMockEvent({ type: "pre" });
			const egress = claudeHarness.formatEgress(event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
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
	});
});
