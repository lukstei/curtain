import { describe, expect, it } from "vitest";
import {
	ANGLE_BRACKET_ENCLOSURE_REGEX,
	BARE_SKILL_COMMAND_REGEX,
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

	it("returns error directing to skill invocation when /curtain is called", () => {
		const expectedErr = {
			type: "error",
			error:
				"Curtain is an instruction runner. Start a workflow by invoking its skill directly (e.g. /<skill-name>).",
		};
		expect(parseCommand("/curtain")).toEqual(expectedErr);
		expect(parseCommand("$curtain")).toEqual(expectedErr);
		expect(parseCommand("/curtain:curtain")).toEqual(expectedErr);
		expect(parseCommand("/curtain task.md")).toEqual(expectedErr);
		expect(parseCommand("$curtain task.md")).toEqual(expectedErr);
		expect(parseCommand("/curtain:curtain task.md")).toEqual(expectedErr);
	});

	it("parses bare skill commands and non-curtain messages", () => {
		expect(parseCommand("Hello agent, please fix this bug")).toEqual({
			type: "none",
		});
		expect(parseCommand("[TODO] Fix auth bug")).toEqual({
			type: "none",
		});
		expect(parseCommand("[WIP] Refactor parser")).toEqual({
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
		expect(parseCommand("/deploy")).toEqual({
			type: "skill",
			skill: { name: "deploy" },
		});
		expect(parseCommand("/deploy staging")).toEqual({
			type: "skill",
			skill: { name: "deploy" },
		});
		expect(parseCommand("$deploy")).toEqual({
			type: "skill",
			skill: { name: "deploy" },
		});
	});

	it("parses Markdown link mentions with target path", () => {
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
			parseCommand(undefined, "/plugins/other/skills/custom/SKILL.md"),
		).toEqual({
			type: "skill",
			skill: { name: "custom" },
			targetPath: "/plugins/other/skills/custom/SKILL.md",
		});
	});

	describe("Command Regular Expressions", () => {
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
