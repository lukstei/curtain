import { describe, expect, it } from "vitest";
import { parseCommand } from "./parseCommand.ts";

describe("parseCommand.ts", () => {
	it("parses slash commands", () => {
		expect(parseCommand("/next")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(parseCommand("$next")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(parseCommand("/curtain next")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(parseCommand("$curtain:next")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
	});

	it("returns error for bare /curtain or missing path", () => {
		expect(parseCommand("/curtain")).toEqual({
			isCurtainCommand: true,
			error: "Missing required script path argument.",
		});
		expect(parseCommand("$curtain")).toEqual({
			isCurtainCommand: true,
			error: "Missing required script path argument.",
		});
		expect(parseCommand("/curtain run")).toEqual({
			isCurtainCommand: true,
			error: "Missing required script path argument.",
		});
	});

	it("parses script file runs with file mentions", () => {
		expect(parseCommand("/curtain task.md")).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "task.md" },
		});
		expect(parseCommand("$curtain:start task.md")).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "task.md" },
		});
		expect(parseCommand("/curtain run @[path/to/script.md]")).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "path/to/script.md" },
		});
	});

	it("returns isCurtainCommand false for non-curtain messages and arbitrary hyphenated skills", () => {
		expect(parseCommand("Hello agent, please fix this bug")).toEqual({
			isCurtainCommand: false,
		});
		expect(parseCommand("/curtain-")).toEqual({
			isCurtainCommand: false,
		});
		expect(parseCommand("/curtain-custom")).toEqual({
			isCurtainCommand: false,
		});
		expect(parseCommand("/curtain-run task.md")).toEqual({
			isCurtainCommand: false,
		});
		expect(parseCommand("/curtain-status")).toEqual({
			isCurtainCommand: false,
		});
		expect(parseCommand("/curtain-stop")).toEqual({
			isCurtainCommand: false,
		});
		expect(parseCommand("/curtain-drop")).toEqual({
			isCurtainCommand: false,
		});
		expect(parseCommand("/curtain-help")).toEqual({
			isCurtainCommand: false,
		});
	});

	it("parses skill link commands (Codex syntax)", () => {
		expect(parseCommand("[$next](skills/next/SKILL.md)")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(parseCommand("[next](/path/to/SKILL.md)")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(parseCommand("[$next]")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(parseCommand("[next]")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(parseCommand("[$curtain:next]")).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(
			parseCommand("[$curtain](skills/curtain/SKILL.md) curtain-test"),
		).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "curtain-test" },
		});
		expect(parseCommand("[$curtain] curtain-test")).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "curtain-test" },
		});
		expect(parseCommand("[$curtain:start] curtain-test")).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "curtain-test" },
		});
		expect(parseCommand("[$curtain]")).toEqual({
			isCurtainCommand: true,
			error: "Missing required script path argument.",
		});
		expect(
			parseCommand("[$curtain-test](skills/curtain-test/SKILL.md)"),
		).toEqual({
			isCurtainCommand: false,
		});
	});

	it("resolves command from skillInvocationPath fallback", () => {
		expect(
			parseCommand(undefined, "/plugins/curtain/skills/next/SKILL.md"),
		).toEqual({
			isCurtainCommand: true,
			command: { name: "next" },
		});
		expect(
			parseCommand("curtain-test", "/plugins/curtain/skills/curtain/SKILL.md"),
		).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "curtain-test" },
		});
	});
});
