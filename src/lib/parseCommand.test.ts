import { describe, expect, it } from "vitest";
import {
	ANGLE_BRACKET_ENCLOSURE_REGEX,
	BARE_SKILL_COMMAND_REGEX,
	COMMAND_REGEX,
	cleanFilePathArgument,
	FILE_AT_REGEX,
	FILE_BRACKET_REGEX,
	FILE_QUOTE_REGEX,
	parseCommand,
	SKILL_LINK_WITH_OPTIONAL_PATH_REGEX,
	WHITESPACE_SPLIT_REGEX,
} from "./parseCommand.ts";

describe("parseCommand.ts", () => {
	it("parses slash commands", () => {
		expect(parseCommand("/next")).toEqual({ type: "next" });
		expect(parseCommand("$next")).toEqual({ type: "next" });
		expect(parseCommand("/curtain next")).toEqual({ type: "next" });
		expect(parseCommand("$curtain:next")).toEqual({ type: "next" });
		expect(parseCommand("/curtain:next")).toEqual({ type: "next" });
	});

	it("returns error for bare /curtain or missing path", () => {
		expect(parseCommand("/curtain")).toEqual({
			type: "error",
			error: "Missing required script path argument.",
		});
		expect(parseCommand("$curtain")).toEqual({
			type: "error",
			error: "Missing required script path argument.",
		});
		expect(parseCommand("/curtain:curtain")).toEqual({
			type: "error",
			error: "Missing required script path argument.",
		});
	});

	it("parses script file runs with file mentions", () => {
		expect(parseCommand("/curtain task.md")).toEqual({
			type: "run",
			path: "task.md",
		});
		expect(parseCommand("$curtain task.md")).toEqual({
			type: "run",
			path: "task.md",
		});
		expect(parseCommand("/curtain:curtain task.md")).toEqual({
			type: "run",
			path: "task.md",
		});
		expect(parseCommand("/curtain @[path/to/script.md]")).toEqual({
			type: "run",
			path: "path/to/script.md",
		});
	});

	it("parses bare skill commands and non-curtain messages", () => {
		expect(parseCommand("Hello agent, please fix this bug")).toEqual({
			type: "none",
		});
		expect(parseCommand("/curtain-")).toEqual({
			type: "skill",
			skill: { name: "curtain-" },
		});
		expect(parseCommand("/curtain-custom")).toEqual({
			type: "skill",
			skill: { name: "curtain-custom" },
		});
		expect(parseCommand("/curtain-run task.md")).toEqual({
			type: "none",
		});
		expect(parseCommand("$curtain-start task.md")).toEqual({
			type: "none",
		});
	});

	it("parses Markdown link mentions with target path and trailing arguments", () => {
		expect(
			parseCommand(
				"[$curtain](skills/curtain/SKILL.md) @[path/to/playbook.md]",
			),
		).toEqual({
			type: "run",
			path: "path/to/playbook.md",
		});
		expect(parseCommand("[$curtain](skills/curtain/SKILL.md) next")).toEqual({
			type: "next",
		});
		expect(parseCommand("[$next](skills/next/SKILL.md)")).toEqual({
			type: "next",
		});
		expect(
			parseCommand("[$curtain-test](skills/curtain-test/SKILL.md)"),
		).toEqual({
			type: "skill",
			skill: { name: "curtain-test" },
			targetPath: "skills/curtain-test/SKILL.md",
		});
	});

	it("parses namespaced skill link mentions", () => {
		expect(
			parseCommand(
				"[$curtain:curtain](skills/curtain/SKILL.md) @[path/to/playbook.md]",
			),
		).toEqual({
			type: "run",
			path: "path/to/playbook.md",
		});
		expect(parseCommand("[$curtain:next](skills/next/SKILL.md)")).toEqual({
			type: "next",
		});
		expect(parseCommand("[$plugin:custom](skills/custom/SKILL.md)")).toEqual({
			type: "skill",
			skill: { namespace: "plugin", name: "custom" },
			targetPath: "skills/custom/SKILL.md",
		});
	});

	it("handles fallback to skillInvocationPath when command prefix is omitted", () => {
		expect(
			parseCommand("next", "/plugins/curtain/skills/curtain/SKILL.md"),
		).toEqual({
			type: "next",
		});
		expect(
			parseCommand("curtain-test", "/plugins/curtain/skills/curtain/SKILL.md"),
		).toEqual({
			type: "run",
			path: "curtain-test",
		});
		expect(
			parseCommand(undefined, "/plugins/other/skills/custom/SKILL.md"),
		).toEqual({
			type: "skill",
			skill: { name: "custom" },
			targetPath: "/plugins/other/skills/custom/SKILL.md",
		});
	});

	describe("cleanFilePathArgument", () => {
		it("cleans bracket, quote, at-sign, and plain file path arguments", () => {
			expect(cleanFilePathArgument("@[path/to/script.md]")).toBe(
				"path/to/script.md",
			);
			expect(cleanFilePathArgument('"path/to/script.md"')).toBe(
				"path/to/script.md",
			);
			expect(cleanFilePathArgument("'path/to/script.md'")).toBe(
				"path/to/script.md",
			);
			expect(cleanFilePathArgument("@path/to/script.md")).toBe(
				"path/to/script.md",
			);
			expect(cleanFilePathArgument("path/to/script.md extra")).toBe(
				"path/to/script.md",
			);
			expect(cleanFilePathArgument("")).toBeNull();
			expect(cleanFilePathArgument("   ")).toBeNull();
		});
	});

	describe("Command Regular Expressions", () => {
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

		it("splits whitespace-separated tokens", () => {
			const text = "command   arg1\t\targ2\narg3";
			expect(text.trim().split(WHITESPACE_SPLIT_REGEX)).toEqual([
				"command",
				"arg1",
				"arg2",
				"arg3",
			]);
		});
	});
});
