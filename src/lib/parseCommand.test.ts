import { describe, expect, it } from "vitest";
import { parseCommand, WHITESPACE_SPLIT_REGEX } from "./parseCommand.ts";

describe("parseCommand.ts", () => {
	it("parses slash commands", () => {
		expect(parseCommand("/next")).toEqual({ type: "next" });
		expect(parseCommand("$next")).toEqual({ type: "next" });
		expect(parseCommand("$curtain:next")).toEqual({ type: "next" });
		expect(parseCommand("/curtain:next")).toEqual({ type: "next" });
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

	it("parses Markdown link mentions", () => {
		expect(parseCommand("[$next](skills/next/SKILL.md)")).toEqual({
			type: "next",
		});
		expect(
			parseCommand("[$curtain-test](skills/curtain-test/SKILL.md)"),
		).toEqual({
			type: "skill",
			skill: { name: "curtain-test" },
		});
	});

	it("parses namespaced skill link mentions", () => {
		expect(parseCommand("[$curtain:next](skills/next/SKILL.md)")).toEqual({
			type: "next",
		});
		expect(parseCommand("[$plugin:custom](skills/custom/SKILL.md)")).toEqual({
			type: "skill",
			skill: { namespace: "plugin", name: "custom" },
		});
	});

	it("handles fallback to skillInvocationPath when command prefix is omitted", () => {
		expect(
			parseCommand(undefined, "/plugins/curtain/skills/next/SKILL.md"),
		).toEqual({
			type: "next",
		});
		expect(
			parseCommand(undefined, "/plugins/other/skills/custom/SKILL.md"),
		).toEqual({
			type: "skill",
			skill: {
				name: "custom",
				path: "/plugins/other/skills/custom/SKILL.md",
			},
		});
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
