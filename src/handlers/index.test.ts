import { describe, expect, it } from "vitest";
import type { HookInfo } from "../types.ts";
import { handle } from "./index.ts";

describe("handlers index dispatch", () => {
	it("dispatches pre hooks to handlePre", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "curtain-test-pre",
			workspacePath: "/test",
			harness: "agy",
			prompt: "",
		};
		const res = handle(info, null);
		expect(res).toEqual({ state: null, response: { action: "pass" } });
	});

	it("dispatches stop hooks to handleStop", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "curtain-test-stop",
			workspacePath: "/test",
			harness: "agy",
		};
		const res = handle(info, null);
		expect(res).toEqual({ state: null, response: { action: "allow" } });
	});

	it("dispatches tool hooks to handlePreTool", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "curtain-test-tool",
			workspacePath: "/test",
			harness: "agy",
			toolCall: { name: "view_file", args: { AbsolutePath: "/test/file.md" } },
		};
		const res = handle(info, null);
		expect(res).toEqual({ state: null, response: { action: "allow" } });
	});

	it("throws on unknown hook type", () => {
		const info = {
			type: "unknown",
			conversationId: "curtain-test-err",
			workspacePath: "/test",
			harness: "agy",
		} as unknown as HookInfo;

		expect(() => handle(info, null)).toThrow("Never assertion failed");
	});
});
