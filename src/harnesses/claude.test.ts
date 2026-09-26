import { describe, expect, it } from "vitest";
import { claudeHarness } from "./claude.ts";

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

	describe("resolveConversationId", () => {
		it("resolves from payload session_id", () => {
			expect(
				claudeHarness.resolveConversationId({ session_id: "claude-session-1" }, {}),
			).toBe("claude-session-1");
		});

		it("resolves from env CLAUDE_CODE_SESSION_ID", () => {
			expect(
				claudeHarness.resolveConversationId({}, { CLAUDE_CODE_SESSION_ID: "env-session" }),
			).toBe("env-session");
		});

		it("falls back to default", () => {
			expect(claudeHarness.resolveConversationId({}, {})).toBe("default");
		});
	});

	describe("handle stub", () => {
		it("returns empty egress and untouched state", () => {
			const res = claudeHarness.handle({}, {
				conversationId: "c1",
				state: null,
				mode: "pre",
				env: {},
			});
			expect(res.egress).toEqual({ exitCode: 0, stdout: "{}" });
			expect(res.nextState).toBeNull();
		});
	});

	describe("getSkillDirs", () => {
		it("returns generic and Claude skill directories", () => {
			const dirs = claudeHarness.getSkillDirs("/workspace", {
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
});
