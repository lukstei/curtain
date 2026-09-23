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
