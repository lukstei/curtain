import { describe, expect, it } from "vitest";
import { parseScript } from "./parser.ts";

describe("parser.ts", () => {
	it("parses single step without delimiters", () => {
		const content = "# Simple Task\nRun the test suite and verify.";
		const script = parseScript(content, "task.md");
		expect(script).toMatchInlineSnapshot(`
			{
			  "filePath": "task.md",
			  "steps": [
			    {
			      "content": "# Simple Task
			Run the test suite and verify.",
			      "index": 0,
			      "type": "auto",
			    },
			  ],
			}
		`);
	});

	it("parses multi-step script with intermission and curtain delimiters", () => {
		const content = [
			"# Database Migration",
			"",
			"## Phase 1: Audit",
			"Check table columns.",
			"",
			"<!-- intermission -->",
			"",
			"## Phase 2: Run Migration",
			"Execute migration script locally.",
			"",
			"<!-- curtain -->",
			"",
			"## Phase 3: Cleanup",
			"Update docs and types.",
		].join("\n");

		const script = parseScript(content, "migration.md");
		expect(script).toMatchInlineSnapshot(`
			{
			  "filePath": "migration.md",
			  "steps": [
			    {
			      "content": "# Database Migration

			## Phase 1: Audit
			Check table columns.",
			      "index": 0,
			      "type": "auto",
			    },
			    {
			      "content": "## Phase 2: Run Migration
			Execute migration script locally.",
			      "index": 1,
			      "type": "pause",
			    },
			    {
			      "content": "## Phase 3: Cleanup
			Update docs and types.",
			      "index": 2,
			      "type": "auto",
			    },
			  ],
			}
		`);
	});

	it("handles case-insensitivity and variable whitespace", () => {
		const content = [
			"Step 1 content",
			"<!--   INTERMISSION   -->",
			"Step 2 content",
			"<!--curtain-->",
			"Step 3 content",
		].join("\n");

		const script = parseScript(content, "test.md");
		expect(script.steps).toHaveLength(3);
		expect(script.steps[1].type).toBe("pause");
		expect(script.steps[2].type).toBe("auto");
	});

	it("defaults <!-- curtain --> to auto transition", () => {
		const content = [
			"Step 1 content",
			"<!-- curtain -->",
			"Step 2 content",
		].join("\n");

		const script = parseScript(content, "test.md");
		expect(script.steps).toHaveLength(2);
		expect(script.steps[1].type).toBe("auto");
	});

	it("throws assertion error when content is empty", () => {
		expect(() => parseScript("   ", "empty.md")).toThrow(
			'Script file "empty.md" contains no content.',
		);
	});
});
