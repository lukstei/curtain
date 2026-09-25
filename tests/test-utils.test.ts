import { describe, expect, it } from "vitest";
import { stripAbsolutePath, TRAILING_SLASHES_REGEX } from "./test-utils.ts";

describe("test-utils", () => {
	it("stripAbsolutePath normalizes paths and arrays correctly", () => {
		const root = "/Users/developer/project";
		const assertions = [
			stripAbsolutePath(
				'file ("/Users/developer/project/examples/sample.md")',
				root,
			),
			stripAbsolutePath(
				["step 1", 'file ("/Users/developer/project/flow.json")'],
				root,
			),
			stripAbsolutePath("relative/path/only.md", root),
			stripAbsolutePath(
				"windows (C:\\Users\\developer\\project\\examples\\test.md)",
				"C:\\Users\\developer\\project",
			),
			stripAbsolutePath(
				{ nested: { path: "/Users/developer/project/file.ts" } },
				root,
			),
		];

		expect(assertions).toMatchInlineSnapshot(`
			[
			  "file ("examples/sample.md")",
			  [
			    "step 1",
			    "file ("flow.json")",
			  ],
			  "relative/path/only.md",
			  "windows (examples\\test.md)",
			  {
			    "nested": {
			      "path": "file.ts",
			    },
			  },
			]
		`);
	});

	it("strips trailing slashes from path strings", () => {
		const samples = [
			"path/to/dir/",
			"path/to/dir///",
			"path\\to\\dir\\",
			"path\\to\\dir\\\\\\",
			"path/without/trailing",
		];

		expect(
			samples.map((s) => ({
				original: s,
				cleaned: s.replace(TRAILING_SLASHES_REGEX, ""),
			})),
		).toMatchInlineSnapshot(`
			[
			  {
			    "cleaned": "path/to/dir",
			    "original": "path/to/dir/",
			  },
			  {
			    "cleaned": "path/to/dir",
			    "original": "path/to/dir///",
			  },
			  {
			    "cleaned": "path\\to\\dir",
			    "original": "path\\to\\dir\\",
			  },
			  {
			    "cleaned": "path\\to\\dir",
			    "original": "path\\to\\dir\\\\\\",
			  },
			  {
			    "cleaned": "path/without/trailing",
			    "original": "path/without/trailing",
			  },
			]
		`);
	});
});
