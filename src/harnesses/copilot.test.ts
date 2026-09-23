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
		isStop: false,
		stopHookActive: false,
		isInterrupted: false,
		latestMessage: null,
		rawPayload: {},
		...overrides,
	};
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

		it("returns false without COPILOT_PLUGIN_DATA or COPILOT_SESSION_ID", () => {
			expect(copilotHarness.detect({}, {})).toBe(false);
		});
	});

	describe("normalize", () => {
		it("normalizes pre event with prompt", () => {
			const event = copilotHarness.normalize({
				conversationId: "copilot-c1",
				cwd: "/copilot/workspace",
				prompt: "/curtain raise",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "copilot-c1",
				  "harness": "copilot",
				  "isInterrupted": false,
				  "isStop": false,
				  "latestMessage": {
				    "content": "/curtain raise",
				    "type": "USER_INPUT",
				  },
				  "prompt": "/curtain raise",
				  "rawPayload": {
				    "conversationId": "copilot-c1",
				    "cwd": "/copilot/workspace",
				    "prompt": "/curtain raise",
				  },
				  "stopHookActive": false,
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
			expect(event.type).toBe("stop");
			expect(event.isStop).toBe(true);
		});
	});

	describe("extractLatestMessage", () => {
		it("extracts prompt on pre", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "/curtain raise",
			});
			const res = copilotHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "USER_INPUT",
				content: "/curtain raise",
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
			expect(JSON.parse(egress.stdout ?? "{}")).toEqual({
				decision: "block",
				reason: "Step 2",
			});
		});

		it("formats Stop allow decision as empty JSON", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = copilotHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(egress.stdout).toBe("{}");
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
});
