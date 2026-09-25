import { describe, expect, it } from "vitest";
import {
	BLOCKQUOTE_PREFIX_REGEX,
	CALLOUT_ANNOTATION_REGEX,
	CALLOUT_LINE_REGEX,
	LINE_SPLIT_REGEX,
	parseScript,
} from "./index.ts";

describe("parser", () => {
	describe("parseScript", () => {
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
				"> [!INTERMISSION] Review carefully",
				"",
				"## Phase 2: Run Migration",
				"Execute migration script locally.",
				"",
				"> [!CURTAIN]",
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
				      "instruction": "Review carefully",
				      "type": "pause",
				    },
				    {
				      "content": "## Phase 2: Run Migration

				Execute migration script locally.",
				      "index": 1,
				      "type": "auto",
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
				">   [!INTERMISSION]   Verify everything",
				"Step 2 content",
				">[!curtain]",
				"Step 3 content",
			].join("\n");

			const script = parseScript(content, "test.md");
			expect(script.steps).toHaveLength(3);
			expect(script.steps[0].type).toBe("pause");
			expect(script.steps[0].instruction).toBe("Verify everything");
			expect(script.steps[1].type).toBe("auto");
			expect(script.steps[2].type).toBe("auto");
		});

		it("defaults > [!CURTAIN] to auto transition without instruction", () => {
			const content = ["Step 1 content", "> [!CURTAIN]", "Step 2 content"].join(
				"\n",
			);

			const script = parseScript(content, "test.md");
			expect(script.steps).toHaveLength(2);
			expect(script.steps[0].type).toBe("auto");
			expect(script.steps[0].instruction).toBeUndefined();
		});

		it("extracts multi-line instructions and trims whitespace", () => {
			const content = [
				"Step 1 content",
				"> [!INTERMISSION] Review carefully",
				"> - Ensure all tests pass",
				"> - Verify performance metrics",
				"Step 2 content",
			].join("\n");

			const script = parseScript(content, "test.md");
			expect(script.steps[0].instruction).toBe(
				"Review carefully\n- Ensure all tests pass\n- Verify performance metrics",
			);
		});

		it("extracts multi-line instructions when first line has no text", () => {
			const content = [
				"Step 1 content",
				"> [!INTERMISSION]",
				"> Line 1 of instruction",
				"> Line 2 of instruction",
				"Step 2 content",
			].join("\n");

			const script = parseScript(content, "test.md");
			expect(script.steps[0].instruction).toBe(
				"Line 1 of instruction\nLine 2 of instruction",
			);
		});

		it("ignores blockquotes inside fenced code blocks and does not split steps", () => {
			const content = [
				"# Deployment Step",
				"Here is an example playbook callout:",
				"```markdown",
				"> [!INTERMISSION] This should not split the step",
				"```",
				"Perform the actual deployment now.",
				"",
				"> [!CURTAIN]",
			].join("\n");

			const script = parseScript(content, "deploy.md");
			expect(script.steps).toHaveLength(1);
			expect(script.steps[0].type).toBe("auto");
			expect(script.steps[0].content).toContain(
				"> [!INTERMISSION] This should not split the step",
			);
		});

		it("throws assertion error when content is empty", () => {
			expect(() => parseScript("   ", "empty.md")).toThrow(
				'Script file "empty.md" contains no content.',
			);
		});

		it("throws assertion error when delimiter is at the beginning of a script", () => {
			const content = ["> [!CURTAIN]", "Step 1 content"].join("\n");
			expect(() => parseScript(content, "start.md")).toThrow(
				'Curtain delimiters cannot appear consecutively or at the beginning of script "start.md".',
			);
		});

		it("throws assertion error when delimiters appear consecutively", () => {
			const content = [
				"Step 1 content",
				"",
				"> [!INTERMISSION]",
				"",
				"> [!CURTAIN]",
				"",
				"Step 2 content",
			].join("\n");
			expect(() => parseScript(content, "consecutive.md")).toThrow(
				'Curtain delimiters cannot appear consecutively or at the beginning of script "consecutive.md".',
			);
		});

		it("parses single step concluding with intermission delimiter", () => {
			const content = [
				"# Only Act",
				"Perform action.",
				"> [!INTERMISSION] Review before finish",
			].join("\n");
			const script = parseScript(content, "single.md");
			expect(script.steps).toHaveLength(1);
			expect(script.steps[0].type).toBe("pause");
			expect(script.steps[0].instruction).toBe("Review before finish");
		});
	});

	describe("Callout Delimiters", () => {
		it("matches callout annotations in document text", () => {
			const samples = [
				"> [!CURTAIN]",
				"> [!INTERMISSION]",
				"Intro\n\n> [!CURTAIN] Proceed\nNext step",
				"   > [!intermission] check work",
				"Regular markdown without delimiter",
			];

			expect(
				samples.map((s) => ({
					sample: s,
					matches: CALLOUT_ANNOTATION_REGEX.test(s),
				})),
			).toMatchInlineSnapshot(`
				[
				  {
				    "matches": true,
				    "sample": "> [!CURTAIN]",
				  },
				  {
				    "matches": true,
				    "sample": "> [!INTERMISSION]",
				  },
				  {
				    "matches": true,
				    "sample": "Intro

				> [!CURTAIN] Proceed
				Next step",
				  },
				  {
				    "matches": true,
				    "sample": "   > [!intermission] check work",
				  },
				  {
				    "matches": false,
				    "sample": "Regular markdown without delimiter",
				  },
				]
			`);
		});

		it("parses callout lines into type and instruction", () => {
			const lines = [
				"[!CURTAIN]",
				"[!INTERMISSION] Review the code changes",
				"  [!curtain]   advance automatically",
				"[!NOTE] Not a delimiter",
			];

			expect(
				lines.map((line) => {
					const match = line.match(CALLOUT_LINE_REGEX);
					return match
						? { type: match[1].toUpperCase(), instruction: match[2].trim() }
						: null;
				}),
			).toMatchInlineSnapshot(`
				[
				  {
				    "instruction": "",
				    "type": "CURTAIN",
				  },
				  {
				    "instruction": "Review the code changes",
				    "type": "INTERMISSION",
				  },
				  {
				    "instruction": "advance automatically",
				    "type": "CURTAIN",
				  },
				  null,
				]
			`);
		});

		it("strips blockquote prefixes", () => {
			const lines = [
				"> Line with space",
				">Line without space",
				"   > Line with 3 leading spaces",
				"    > Four spaces (not stripped as blockquote prefix)",
			];

			expect(
				lines.map((l) => l.replace(BLOCKQUOTE_PREFIX_REGEX, "")),
			).toMatchInlineSnapshot(`
				[
				  "Line with space",
				  "Line without space",
				  "Line with 3 leading spaces",
				  "    > Four spaces (not stripped as blockquote prefix)",
				]
			`);
		});

		it("splits text by line breaks across platforms", () => {
			const unixText = "line1\nline2\nline3";
			const windowsText = "line1\r\nline2\r\nline3";

			expect(unixText.split(LINE_SPLIT_REGEX)).toEqual([
				"line1",
				"line2",
				"line3",
			]);
			expect(windowsText.split(LINE_SPLIT_REGEX)).toEqual([
				"line1",
				"line2",
				"line3",
			]);
		});
	});
});
