import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseJsonSafe, readStdin, stripBom } from "./stdin.ts";

describe("stdin", () => {
	describe("stripBom", () => {
		it("strips UTF-8 BOM from start of text", () => {
			expect(stripBom("\uFEFFhello")).toBe("hello");
			expect(stripBom("hello")).toBe("hello");
		});
	});

	describe("parseJsonSafe", () => {
		it("parses valid JSON with BOM", () => {
			expect(parseJsonSafe('\uFEFF{"hello":"world"}')).toEqual({
				hello: "world",
			});
		});

		it("returns empty object on empty or invalid input without throwing", () => {
			expect(parseJsonSafe("")).toEqual({});
			expect(parseJsonSafe("not valid json")).toEqual({});
			expect(parseJsonSafe("   ")).toEqual({});
		});
	});

	describe("readStdin", () => {
		it("reads stream content and resolves on end", async () => {
			const stream = Readable.from(['\uFEFF{"test":', "123}"]);
			const result = await readStdin(1000, stream);
			expect(result).toBe('{"test":123}');
		});

		it("triggers timeout fallback if end event is delayed/swallowed", async () => {
			let pushed = false;
			const stream = new Readable({
				read() {
					if (!pushed) {
						pushed = true;
						this.push('{"hung":true}');
					}
				},
			});

			const result = await readStdin(50, stream);
			expect(result).toBe('{"hung":true}');
		});
	});
});
