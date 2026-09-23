import { describe, expect, it } from "vitest";
import {
	detectHarness,
	resolveConversationIdFromHarnesses,
	resolveStorageDirFromHarnesses,
} from "./index.ts";

describe("detectHarness", () => {
	describe("Harness Detection Matrix", () => {
		it("detects Copilot when COPILOT_PLUGIN_DATA is set", () => {
			const harness = detectHarness(
				{},
				{ COPILOT_PLUGIN_DATA: "/tmp/copilot" },
			);
			expect(harness).toBe("copilot");
		});

		it("detects Copilot when COPILOT_SESSION_ID is set", () => {
			const harness = detectHarness({}, { COPILOT_SESSION_ID: "copilot-s1" });
			expect(harness).toBe("copilot");
		});

		it("detects Copilot from timestamp in payload", () => {
			const harness = detectHarness(
				{
					timestamp: "2026-09-23T22:00:00Z",
					hook_event_name: "PreToolUse",
				},
				{},
			);
			expect(harness).toBe("copilot");
		});

		it("detects Codex from hookEventName in payload", () => {
			const harness = detectHarness({ hookEventName: "UserPromptSubmit" }, {});
			expect(harness).toBe("codex");
		});

		it("detects Codex from turn_id in payload", () => {
			const harness = detectHarness(
				{
					hook_event_name: "UserPromptSubmit",
					turn_id: "turn-123",
				},
				{},
			);
			expect(harness).toBe("codex");
		});

		it("detects Codex when CODEX_SESSION_ID is set", () => {
			const harness = detectHarness({}, { CODEX_SESSION_ID: "session-123" });
			expect(harness).toBe("codex");
		});

		it("detects Codex when PLUGIN_DATA is set", () => {
			const harness = detectHarness({}, { PLUGIN_DATA: "/tmp/codex" });
			expect(harness).toBe("codex");
		});

		it("detects AGY when AGY_HOOK_ACTIVE is set", () => {
			const harness = detectHarness({}, { AGY_HOOK_ACTIVE: "1" });
			expect(harness).toBe("agy");
		});

		it("detects AGY when ANTIGRAVITY_CONVERSATION_ID is set", () => {
			const harness = detectHarness(
				{},
				{ ANTIGRAVITY_CONVERSATION_ID: "conv-123" },
			);
			expect(harness).toBe("agy");
		});

		it("detects AGY when GEMINI_CLI or ANTIGRAVITY is set", () => {
			expect(detectHarness({}, { GEMINI_CLI: "1" })).toBe("agy");
			expect(detectHarness({}, { ANTIGRAVITY: "1" })).toBe("agy");
		});

		it("detects AGY from artifactDirectoryPath in payload", () => {
			const harness = detectHarness(
				{ artifactDirectoryPath: "/tmp/brain/uuid" },
				{},
			);
			expect(harness).toBe("agy");
		});

		it("detects AGY from transcriptPath ending with .system_generated/logs/transcript.jsonl", () => {
			const harness = detectHarness(
				{
					transcriptPath:
						"/Users/test/.gemini/antigravity/brain/uuid/.system_generated/logs/transcript.jsonl",
				},
				{},
			);
			expect(harness).toBe("agy");
		});

		it("detects Claude Code from hook_event_name", () => {
			const harness = detectHarness(
				{
					hook_event_name: "PreToolUse",
					session_id: "claude-session-123",
					tool_name: "Bash",
				},
				{},
			);
			expect(harness).toBe("claude");
		});

		it("detects Claude Code when CLAUDE_CODE_SESSION_ID is set", () => {
			const harness = detectHarness(
				{},
				{ CLAUDE_CODE_SESSION_ID: "session-claude-1" },
			);
			expect(harness).toBe("claude");
		});

		it("does not misdetect Codex with turn_id as Claude Code", () => {
			const harness = detectHarness(
				{
					hook_event_name: "PreToolUse",
					session_id: "codex-s1",
					turn_id: "turn-456",
				},
				{},
			);
			expect(harness).toBe("codex");
		});

		it("does not misdetect Copilot with timestamp as Claude Code", () => {
			const harness = detectHarness(
				{
					hook_event_name: "PreToolUse",
					session_id: "copilot-s1",
					timestamp: "2026-09-23T22:00:00Z",
				},
				{},
			);
			expect(harness).toBe("copilot");
		});

		it("returns null when no indicators exist", () => {
			const harness = detectHarness({}, {});
			expect(harness).toBeNull();
		});
	});

	describe("resolveConversationIdFromHarnesses", () => {
		it("resolves conversation ID for Antigravity", () => {
			expect(
				resolveConversationIdFromHarnesses({
					ANTIGRAVITY_CONVERSATION_ID: "agy-uuid-1",
				}),
			).toBe("agy-uuid-1");
		});

		it("resolves conversation ID for Claude Code", () => {
			expect(
				resolveConversationIdFromHarnesses({
					CLAUDE_CODE_SESSION_ID: "claude-uuid-1",
				}),
			).toBe("claude-uuid-1");
		});

		it("resolves conversation ID for Codex", () => {
			expect(
				resolveConversationIdFromHarnesses({
					CODEX_SESSION_ID: "codex-uuid-1",
				}),
			).toBe("codex-uuid-1");
		});

		it("resolves conversation ID for Copilot", () => {
			expect(
				resolveConversationIdFromHarnesses({
					COPILOT_SESSION_ID: "copilot-uuid-1",
				}),
			).toBe("copilot-uuid-1");
		});

		it("returns null when no harness environment variables are set", () => {
			expect(resolveConversationIdFromHarnesses({})).toBeNull();
		});
	});

	describe("resolveStorageDirFromHarnesses", () => {
		it("resolves storage directory for Codex from PLUGIN_DATA", () => {
			expect(
				resolveStorageDirFromHarnesses({
					PLUGIN_DATA: "/path/to/codex/data",
				}),
			).toBe("/path/to/codex/data");
		});

		it("resolves storage directory for Claude Code from CLAUDE_PLUGIN_DATA", () => {
			expect(
				resolveStorageDirFromHarnesses({
					CLAUDE_PLUGIN_DATA: "/path/to/claude/data",
				}),
			).toBe("/path/to/claude/data");
		});

		it("resolves storage directory for Copilot from COPILOT_PLUGIN_DATA", () => {
			expect(
				resolveStorageDirFromHarnesses({
					COPILOT_PLUGIN_DATA: "/path/to/copilot/data",
				}),
			).toBe("/path/to/copilot/data");
		});

		it("resolves storage directory for Antigravity from AGY_PLUGIN_DATA", () => {
			expect(
				resolveStorageDirFromHarnesses({
					AGY_PLUGIN_DATA: "/path/to/agy/data",
				}),
			).toBe("/path/to/agy/data");
		});

		it("returns null when no harness storage variables are set", () => {
			expect(resolveStorageDirFromHarnesses({})).toBeNull();
		});
	});
});
