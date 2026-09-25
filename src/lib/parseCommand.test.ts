import { describe, expect, it } from "vitest";
import { cleanFilePathArgument, parseCommand } from "./parseCommand.ts";

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
		expect(parseCommand("/curtain-status")).toEqual({
			type: "skill",
			skill: { name: "curtain-status" },
		});
		expect(parseCommand("/curtain-stop")).toEqual({
			type: "skill",
			skill: { name: "curtain-stop" },
		});
		expect(parseCommand("/curtain-drop")).toEqual({
			type: "skill",
			skill: { name: "curtain-drop" },
		});
		expect(parseCommand("/curtain-help")).toEqual({
			type: "skill",
			skill: { name: "curtain-help" },
		});
		expect(parseCommand("/curtain:start")).toEqual({
			type: "none",
		});
		expect(parseCommand("/curtain:run")).toEqual({
			type: "none",
		});
	});

	it("parses skill link commands (Codex syntax)", () => {
		expect(parseCommand("[$next](skills/next/SKILL.md)")).toEqual({
			type: "next",
		});
		expect(parseCommand("[next](/path/to/SKILL.md)")).toEqual({
			type: "next",
		});
		expect(parseCommand("[$next]")).toEqual({
			type: "next",
		});
		expect(parseCommand("[next]")).toEqual({
			type: "next",
		});
		expect(parseCommand("[$curtain:next]")).toEqual({
			type: "next",
		});
		expect(
			parseCommand("[$curtain](skills/curtain/SKILL.md) curtain-test"),
		).toEqual({
			type: "run",
			path: "curtain-test",
		});
		expect(parseCommand("[$curtain] curtain-test")).toEqual({
			type: "run",
			path: "curtain-test",
		});
		expect(parseCommand("[$curtain:curtain] curtain-test")).toEqual({
			type: "run",
			path: "curtain-test",
		});
		expect(parseCommand("[$curtain]")).toEqual({
			type: "error",
			error: "Missing required script path argument.",
		});
		expect(
			parseCommand("[$curtain-test](skills/curtain-test/SKILL.md)"),
		).toEqual({
			type: "skill",
			skill: { name: "curtain-test" },
			targetPath: "skills/curtain-test/SKILL.md",
		});
		expect(parseCommand("[$link-skill]")).toEqual({
			type: "skill",
			skill: { name: "link-skill" },
		});
		expect(parseCommand("[$curtain:start]")).toEqual({
			type: "none",
		});
	});

	it("resolves command from skillInvocationPath fallback", () => {
		expect(
			parseCommand(undefined, "/plugins/curtain/skills/next/SKILL.md"),
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
});
