import { describe, expect, it } from "vitest";
import { assertNever } from "./assertNever.ts";

describe("assertNever", () => {
	it("throws with Never assertion failed", () => {
		const invalid = { type: "unknown" } as never;
		expect(() => assertNever(invalid)).toThrow("Never assertion failed");
	});
});
