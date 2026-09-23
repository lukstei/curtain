import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadScript, resolveScriptPath } from "./resolver.ts";
import { stripAbsolutePath } from "./test-utils.ts";

describe("resolver.ts", () => {
	it("resolveScriptPath handles mentions, quotes, and extensionless paths", () => {
		const results = [
			resolveScriptPath("@[examples/weekend.md]"),
			resolveScriptPath("@examples/weekend.md"),
			resolveScriptPath('"examples/weekend.md"'),
			resolveScriptPath("'examples/weekend.md'"),
			resolveScriptPath("examples/weekend"),
			resolveScriptPath("nonexistent/file.md"),
		].map((p) => (p ? stripAbsolutePath(p) : null));

		expect(results).toMatchInlineSnapshot(`
			[
			  "examples/weekend.md",
			  "examples/weekend.md",
			  "examples/weekend.md",
			  "examples/weekend.md",
			  "examples/weekend.md",
			  null,
			]
		`);
	});

	it("resolveScriptPath resolves across workspace paths and absolute paths", () => {
		const absPath = path.resolve(process.cwd(), "examples/weekend.md");
		const fromAbs = resolveScriptPath(absPath);
		const fromWs = resolveScriptPath("weekend.md", [
			path.resolve(process.cwd(), "examples"),
		]);

		expect([
			fromAbs ? stripAbsolutePath(fromAbs) : null,
			fromWs ? stripAbsolutePath(fromWs) : null,
		]).toMatchInlineSnapshot(`
			[
			  "examples/weekend.md",
			  "examples/weekend.md",
			]
		`);
	});

	it("loadScript loads and parses markdown script", () => {
		const res = loadScript("examples/weekend.md");
		expect(res && "script" in res ? res.script.steps.length > 0 : false).toBe(
			true,
		);
	});
});
