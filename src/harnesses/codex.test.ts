import { describe, expect, it } from "vitest";
import { codexHarness } from "./codex.ts";

describe("codexHarness", () => {
	describe("detect", () => {
		it("detects CODEX_SESSION_ID in environment", () => {
			expect(codexHarness.detect({}, { CODEX_SESSION_ID: "session-1" })).toBe(
				true,
			);
		});

		it("detects PLUGIN_DATA in environment", () => {
			expect(codexHarness.detect({}, { PLUGIN_DATA: "/path" })).toBe(true);
		});

		it("detects turn_id in payload", () => {
			expect(codexHarness.detect({ turn_id: "turn-1" }, {})).toBe(true);
		});

		it("detects hookEventName in payload", () => {
			expect(codexHarness.detect({ hookEventName: "PreToolUse" }, {})).toBe(
				true,
			);
		});

		it("returns false for non-matching input", () => {
			expect(codexHarness.detect({}, {})).toBe(false);
		});
	});

	describe("resolveConversationId", () => {
		it("resolves from session_id", () => {
			expect(
				codexHarness.resolveConversationId({ session_id: "codex-1" }, {}),
			).toBe("codex-1");
		});

		it("resolves from sessionId", () => {
			expect(
				codexHarness.resolveConversationId({ sessionId: "codex-2" }, {}),
			).toBe("codex-2");
		});

		it("resolves from env CODEX_SESSION_ID", () => {
			expect(
				codexHarness.resolveConversationId({}, { CODEX_SESSION_ID: "env-codex" }),
			).toBe("env-codex");
		});

		it("falls back to default", () => {
			expect(codexHarness.resolveConversationId({}, {})).toBe("default");
		});
	});

	describe("handle stub", () => {
		it("returns empty egress and untouched state", () => {
			const res = codexHarness.handle({}, {
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
		it("returns Codex skill directories", () => {
			const dirs = codexHarness.getSkillDirs("/workspace", {
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
