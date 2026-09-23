import { describe, expect, it } from "vitest";
import type { HookInfo } from "../types.ts";
import { handle } from "./index.ts";

describe("handlers index dispatch", () => {
	it("dispatches pre hooks to handlePre", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "curtain-test-pre",
			workspacePath: "/test",
		};
		const res = handle(info, null);
		expect(res).toEqual({ state: null, response: {} });
	});

	it("dispatches stop hooks to handleStop", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "curtain-test-stop",
			workspacePath: "/test",
		};
		const res = handle(info, null);
		expect(res).toEqual({ state: null, response: { decision: "allow" } });
	});

	it("throws on unknown hook type", () => {
		const info = {
			type: "unknown",
			conversationId: "curtain-test-err",
			workspacePath: "/test",
		} as unknown as HookInfo;

		expect(() => handle(info, null)).toThrow("Unknown hook type: unknown");
	});
});
