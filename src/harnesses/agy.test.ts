import { describe, expect, it } from "vitest";
import { agyHarness } from "./agy.ts";

describe("agyHarness", () => {
	describe("detect", () => {
		it("detects AGY_HOOK_ACTIVE", () => {
			expect(agyHarness.detect({}, { AGY_HOOK_ACTIVE: "1" })).toBe(true);
		});

		it("detects ANTIGRAVITY_CONVERSATION_ID", () => {
			expect(
				agyHarness.detect({}, { ANTIGRAVITY_CONVERSATION_ID: "uuid-1" }),
			).toBe(true);
		});

		it("detects GEMINI_CLI or ANTIGRAVITY environment variables", () => {
			expect(agyHarness.detect({}, { GEMINI_CLI: "1" })).toBe(true);
			expect(agyHarness.detect({}, { ANTIGRAVITY: "1" })).toBe(true);
		});

		it("detects artifactDirectoryPath in payload", () => {
			expect(
				agyHarness.detect({ artifactDirectoryPath: "/path/to/artifacts" }, {}),
			).toBe(true);
		});

		it("detects transcriptPath ending with .system_generated/logs/transcript.jsonl", () => {
			expect(
				agyHarness.detect(
					{
						transcriptPath:
							"/home/user/.gemini/antigravity/brain/uuid/.system_generated/logs/transcript.jsonl",
					},
					{},
				),
			).toBe(true);
		});

		it("returns false for non-matching payload", () => {
			expect(agyHarness.detect({}, {})).toBe(false);
		});
	});

	describe("resolveConversationId", () => {
		it("resolves from payload conversationId", () => {
			expect(
				agyHarness.resolveConversationId({ conversationId: "agy-conv-1" }, {}),
			).toBe("agy-conv-1");
		});

		it("resolves from env ANTIGRAVITY_CONVERSATION_ID", () => {
			expect(
				agyHarness.resolveConversationId({}, { ANTIGRAVITY_CONVERSATION_ID: "env-conv" }),
			).toBe("env-conv");
		});

		it("falls back to default", () => {
			expect(agyHarness.resolveConversationId({}, {})).toBe("default");
		});
	});

	describe("handle stub", () => {
		it("returns empty egress and untouched state", () => {
			const res = agyHarness.handle({}, {
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
		it("returns AGY skill search paths", () => {
			const dirs = agyHarness.getSkillDirs("/workspace", { HOME: "/home/user" });
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.agents/plugins",
				"/home/user/.gemini/config/skills",
				"/home/user/.gemini/config/plugins",
				"/home/user/.gemini/antigravity/builtin/skills",
			]);
		});
	});
});
