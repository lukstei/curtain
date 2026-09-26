import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { copilotHarness } from "./copilot.ts";

describe("copilotHarness", () => {
	describe("detect", () => {
		it("detects COPILOT_PLUGIN_DATA in environment", () => {
			expect(copilotHarness.detect({}, { COPILOT_PLUGIN_DATA: "/path" })).toBe(
				true,
			);
		});

		it("detects COPILOT_SESSION_ID in environment", () => {
			expect(
				copilotHarness.detect({}, { COPILOT_SESSION_ID: "session-1" }),
			).toBe(true);
		});

		it("detects timestamp and hook_event_name in payload", () => {
			expect(
				copilotHarness.detect(
					{ timestamp: 123456, hook_event_name: "PreToolUse" },
					{},
				),
			).toBe(true);
		});

		it("detects timestamp and hookEventName in payload", () => {
			expect(
				copilotHarness.detect(
					{ timestamp: 123456, hookEventName: "preToolUse" },
					{},
				),
			).toBe(true);
		});

		it("returns false for non-matching input", () => {
			expect(copilotHarness.detect({}, {})).toBe(false);
		});
	});

	describe("resolveConversationId", () => {
		it("resolves from sessionId", () => {
			expect(
				copilotHarness.resolveConversationId({ sessionId: "copilot-1" }, {}),
			).toBe("copilot-1");
		});

		it("resolves from session_id", () => {
			expect(
				copilotHarness.resolveConversationId({ session_id: "copilot-2" }, {}),
			).toBe("copilot-2");
		});

		it("resolves from conversationId", () => {
			expect(
				copilotHarness.resolveConversationId(
					{ conversationId: "copilot-3" },
					{},
				),
			).toBe("copilot-3");
		});

		it("resolves from env COPILOT_SESSION_ID", () => {
			expect(
				copilotHarness.resolveConversationId(
					{},
					{ COPILOT_SESSION_ID: "env-copilot" },
				),
			).toBe("env-copilot");
		});

		it("falls back to default", () => {
			expect(copilotHarness.resolveConversationId({}, {})).toBe("default");
		});
	});

	describe("handle stub", () => {
		it("returns empty egress and untouched state", () => {
			const res = copilotHarness.handle(
				{},
				{
					conversationId: "c1",
					state: null,
					mode: "pre",
					env: {},
				},
			);
			expect(res.egress).toEqual({ exitCode: 0, stdout: "{}" });
			expect(res.nextState).toBeNull();
		});
	});

	describe("getSkillDirs", () => {
		it("returns Copilot skill directories", () => {
			const home = os.homedir();
			const dirs = copilotHarness.getSkillDirs(["/workspace"]);
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.github/skills",
				"/workspace/.claude/skills",
				path.join(home, ".copilot/skills"),
				path.join(home, ".claude/skills"),
				path.join(home, ".agents/skills"),
			]);
		});
	});
});
