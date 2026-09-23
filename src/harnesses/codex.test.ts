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

		it("detects CODEX_SESSION_ID in environment", () => {
			expect(codexHarness.detect({}, { CODEX_SESSION_ID: "session-123" })).toBe(
				true,
			);
		});

		it("returns false without hookEventName or CODEX_SESSION_ID", () => {
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
				prompt: "/curtain raise",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "codex-s1",
				  "harness": "codex",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": {
				    "content": "/curtain raise",
				    "type": "USER_INPUT",
				  },
				  "prompt": "/curtain raise",
				  "rawPayload": {
				    "cwd": "/codex/workspace",
				    "hook_event_name": "UserPromptSubmit",
				    "prompt": "/curtain raise",
				    "session_id": "codex-s1",
				  },
				  "stopHookActive": false,
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
	});
});
