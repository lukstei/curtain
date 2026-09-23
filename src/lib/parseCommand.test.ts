import { describe, expect, it } from "vitest";
import { parseCommand } from "./parseCommand.ts";

describe("parseCommand.ts", () => {
	it("parses slash commands", () => {
		expect(parseCommand("/curtain raise")).toEqual({
			isCurtainCommand: true,
			command: { name: "raise" },
		});
		expect(parseCommand("/curtain next")).toEqual({
			isCurtainCommand: true,
			command: { name: "raise" },
		});
		expect(parseCommand("/curtain-raise")).toEqual({
			isCurtainCommand: true,
			command: { name: "raise" },
		});
		expect(parseCommand("/curtain drop")).toEqual({
			isCurtainCommand: true,
			command: { name: "drop" },
		});
		expect(parseCommand("/curtain-drop")).toEqual({
			isCurtainCommand: true,
			command: { name: "drop" },
		});
		expect(parseCommand("/curtain status")).toEqual({
			isCurtainCommand: true,
			command: { name: "status" },
		});
		expect(parseCommand("/curtain-status")).toEqual({
			isCurtainCommand: true,
			command: { name: "status" },
		});
	});

	it("parses script file runs with file mentions", () => {
		expect(parseCommand("/curtain task.md")).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "task.md" },
		});
		expect(parseCommand("/curtain run @[path/to/script.md]")).toEqual({
			isCurtainCommand: true,
			command: { name: "run", path: "path/to/script.md" },
		});
	});

	it("parses codex mentions", () => {
		expect(parseCommand("$curtain:raise")).toEqual({
			isCurtainCommand: true,
			command: { name: "raise" },
		});
		expect(parseCommand("$curtain:status")).toEqual({
			isCurtainCommand: true,
			command: { name: "status" },
		});
	});

	it("returns isCurtainCommand false for non-curtain messages", () => {
		expect(parseCommand("Hello agent, please fix this bug")).toEqual({
			isCurtainCommand: false,
		});
	});
});
