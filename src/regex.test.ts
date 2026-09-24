import { describe, expect, it } from "vitest";
import {
	AGY_SKILL_PATH_REGEX,
	ANGLE_BRACKET_ENCLOSURE_REGEX,
	BARE_SKILL_COMMAND_REGEX,
	BLOCKQUOTE_PREFIX_REGEX,
	CALLOUT_ANNOTATION_REGEX,
	CALLOUT_LINE_REGEX,
	COMMAND_REGEX,
	FILE_AT_REGEX,
	FILE_BRACKET_REGEX,
	FILE_QUOTE_REGEX,
	LINE_SPLIT_REGEX,
	RESOLVER_BRACKET_REGEX,
	RESOLVER_QUOTE_REGEX,
	SKILL_LINK_PATH_CAPTURE_REGEX,
	SKILL_LINK_WITH_OPTIONAL_PATH_REGEX,
	TERMINATION_CANCEL_REGEX,
	TRAILING_SLASHES_REGEX,
	USER_REQUEST_TAG_REGEX,
	UTF8_BOM_REGEX,
	WHITESPACE_SPLIT_REGEX,
	XML_SKILL_PATH_REGEX,
} from "./regex.ts";

describe("regex.ts", () => {
	describe("Script Parsing & Callout Delimiters", () => {
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
	});

	describe("Skill Invocation & Mention Matching", () => {
		it("matches skill links with optional path", () => {
			const inputs = [
				"[$curtain-test](skills/curtain-test/SKILL.md)",
				"[curtain-test](/path/to/skill.md)",
				"[$curtain-test]",
				"[simple_skill]",
				"not a link",
				"[$has-spaces](path with space)",
			];

			expect(
				inputs.map((input) => {
					const match = input.match(SKILL_LINK_WITH_OPTIONAL_PATH_REGEX);
					return match ? { name: match[1], path: match[2] ?? null } : null;
				}),
			).toMatchInlineSnapshot(`
				[
				  {
				    "name": "curtain-test",
				    "path": "skills/curtain-test/SKILL.md",
				  },
				  {
				    "name": "curtain-test",
				    "path": "/path/to/skill.md",
				  },
				  {
				    "name": "curtain-test",
				    "path": null,
				  },
				  {
				    "name": "simple_skill",
				    "path": null,
				  },
				  null,
				  {
				    "name": "has-spaces",
				    "path": "path with space",
				  },
				]
			`);
		});

		it("captures skill link and path within text", () => {
			const text =
				"Please review [$curtain](plugins/curtain/skills/curtain/SKILL.md) before starting.";
			const match = text.match(SKILL_LINK_PATH_CAPTURE_REGEX);

			expect(
				match ? { name: match[1], path: match[2] } : null,
			).toMatchInlineSnapshot(`
				{
				  "name": "curtain",
				  "path": "plugins/curtain/skills/curtain/SKILL.md",
				}
			`);
		});

		it("matches bare skill commands", () => {
			const commands = [
				"/my-skill",
				"$my-skill",
				"/curtain_review.v1",
				"my-skill",
				"/with spaces",
			];

			expect(
				commands.map((cmd) => {
					const match = cmd.match(BARE_SKILL_COMMAND_REGEX);
					return match ? match[1] : null;
				}),
			).toMatchInlineSnapshot(`
				[
				  "my-skill",
				  "my-skill",
				  "curtain_review.v1",
				  null,
				  null,
				]
			`);
		});

		it("extracts skill path from XML block", () => {
			const xml =
				"<skill>\n  <name>curtain-test</name>\n  <path>/home/user/skills/curtain-test/SKILL.md</path>\n</skill>";
			const match = xml.match(XML_SKILL_PATH_REGEX);

			expect(match ? match[1] : null).toMatchInlineSnapshot(
				`"/home/user/skills/curtain-test/SKILL.md"`,
			);
		});

		it("extracts skill path from AGY skill block", () => {
			const agyPrompt =
				"<SKILL>The path to the skill file is: /Users/dev/.gemini/skills/run/SKILL.md</SKILL>";
			const match = agyPrompt.match(AGY_SKILL_PATH_REGEX);

			expect(match ? match[1] : null).toMatchInlineSnapshot(
				`"/Users/dev/.gemini/skills/run/SKILL.md"`,
			);
		});

		it("strips enclosing angle brackets from path strings", () => {
			const paths = [
				"<path/to/file.md>",
				"path/to/file.md",
				"<only_start",
				"only_end>",
			];

			expect(
				paths.map((p) => p.replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "")),
			).toMatchInlineSnapshot(`
				[
				  "path/to/file.md",
				  "path/to/file.md",
				  "only_start",
				  "only_end",
				]
			`);
		});
	});

	describe("Command Parsing & Argument Extraction", () => {
		it("matches runner commands and captures groups", () => {
			const inputs = [
				"/next",
				"$next",
				"/curtain next",
				"$curtain:next",
				"/curtain",
				"$curtain",
				"/curtain task.md",
				"/curtain run task.md",
				"$curtain:start task.md",
				"/curtain-run task.md",
				"/other-command",
			];

			expect(
				inputs.map((input) => {
					const match = input.match(COMMAND_REGEX);
					return match
						? {
								prefix: match[1] ?? null,
								name: match[2] ?? null,
								rest: match[3] ?? null,
							}
						: null;
				}),
			).toMatchInlineSnapshot(`
				[
				  {
				    "name": "next",
				    "prefix": "/",
				    "rest": null,
				  },
				  {
				    "name": "next",
				    "prefix": "$",
				    "rest": null,
				  },
				  {
				    "name": "next",
				    "prefix": "/curtain ",
				    "rest": null,
				  },
				  {
				    "name": "next",
				    "prefix": "$curtain:",
				    "rest": null,
				  },
				  {
				    "name": "curtain",
				    "prefix": "/",
				    "rest": null,
				  },
				  {
				    "name": "curtain",
				    "prefix": "$",
				    "rest": null,
				  },
				  {
				    "name": "task.md",
				    "prefix": "/curtain ",
				    "rest": null,
				  },
				  {
				    "name": "run",
				    "prefix": "/curtain ",
				    "rest": "task.md",
				  },
				  {
				    "name": "start",
				    "prefix": "$curtain:",
				    "rest": "task.md",
				  },
				  {
				    "name": "curtain-run",
				    "prefix": "/",
				    "rest": "task.md",
				  },
				  {
				    "name": "other-command",
				    "prefix": "/",
				    "rest": null,
				  },
				]
			`);
		});

		it("extracts bracketed, quoted, and at file arguments", () => {
			expect("@[path/to/playbook.md]".match(FILE_BRACKET_REGEX)?.[1]).toBe(
				"path/to/playbook.md",
			);
			expect('"path/to/playbook.md"'.match(FILE_QUOTE_REGEX)?.[1]).toBe(
				"path/to/playbook.md",
			);
			expect("'path/to/playbook.md'".match(FILE_QUOTE_REGEX)?.[1]).toBe(
				"path/to/playbook.md",
			);
			expect("@path/to/playbook.md".match(FILE_AT_REGEX)?.[1]).toBe(
				"path/to/playbook.md",
			);
		});

		it("matches exact resolver paths", () => {
			expect("@[my/script.md]".match(RESOLVER_BRACKET_REGEX)?.[1]).toBe(
				"my/script.md",
			);
			expect("@[my/script.md] extra".match(RESOLVER_BRACKET_REGEX)).toBeNull();

			expect('"my/script.md"'.match(RESOLVER_QUOTE_REGEX)?.[1]).toBe(
				"my/script.md",
			);
			expect("'my/script.md'".match(RESOLVER_QUOTE_REGEX)?.[1]).toBe(
				"my/script.md",
			);
			expect('"my/script.md" extra'.match(RESOLVER_QUOTE_REGEX)).toBeNull();
		});
	});

	describe("Lifecycle, Hooks & Transcripts", () => {
		it("detects termination cancel reasons", () => {
			const reasons = [
				"User cancelled the operation",
				"Session aborted by user",
				"Execution interrupted",
				"Normal completion",
				"Process timeout",
			];

			expect(
				reasons.map((r) => ({
					reason: r,
					cancelled: TERMINATION_CANCEL_REGEX.test(r),
				})),
			).toMatchInlineSnapshot(`
				[
				  {
				    "cancelled": true,
				    "reason": "User cancelled the operation",
				  },
				  {
				    "cancelled": true,
				    "reason": "Session aborted by user",
				  },
				  {
				    "cancelled": true,
				    "reason": "Execution interrupted",
				  },
				  {
				    "cancelled": false,
				    "reason": "Normal completion",
				  },
				  {
				    "cancelled": false,
				    "reason": "Process timeout",
				  },
				]
			`);
		});

		it("extracts prompt from USER_REQUEST tag", () => {
			const prompt = "<USER_REQUEST>\nExecute playbook step 1\n</USER_REQUEST>";
			const match = prompt.match(USER_REQUEST_TAG_REGEX);

			expect(match ? match[1].trim() : null).toMatchInlineSnapshot(
				`"Execute playbook step 1"`,
			);
		});

		it("strips UTF-8 BOM from beginning of text", () => {
			const withBom = '\uFEFF{"key": "value"}';
			const withoutBom = '{"key": "value"}';

			expect(withBom.replace(UTF8_BOM_REGEX, "")).toBe('{"key": "value"}');
			expect(withoutBom.replace(UTF8_BOM_REGEX, "")).toBe('{"key": "value"}');
		});
	});

	describe("Text Utilities", () => {
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

		it("splits whitespace-separated tokens", () => {
			const text = "command   arg1\t\targ2\narg3";

			expect(text.split(WHITESPACE_SPLIT_REGEX)).toEqual([
				"command",
				"arg1",
				"arg2",
				"arg3",
			]);
		});

		it("strips trailing slashes and backslashes", () => {
			const paths = [
				"/path/to/dir/",
				"/path/to/dir///",
				"C:\\path\\to\\dir\\",
				"C:\\path\\to\\dir\\\\\\",
				"/path/to/dir",
			];

			expect(
				paths.map((p) => p.replace(TRAILING_SLASHES_REGEX, "")),
			).toMatchInlineSnapshot(`
				[
				  "/path/to/dir",
				  "/path/to/dir",
				  "C:\\path\\to\\dir",
				  "C:\\path\\to\\dir",
				  "/path/to/dir",
				]
			`);
		});
	});
});
