import { describe, expect, it } from "vitest";
import { formatSkill, normalizeSkillName, parseSkill } from "./parseSkill.ts";

describe("parseSkill", () => {
	it("parses curtain:next in various representations", () => {
		const expected = { namespace: "curtain", name: "next" };
		expect(parseSkill("next")).toEqual(expected);
		expect(parseSkill("/next")).toEqual(expected);
		expect(parseSkill("$next")).toEqual(expected);
		expect(parseSkill("[$next]")).toEqual(expected);
		expect(parseSkill("[next]")).toEqual(expected);
		expect(parseSkill("[$next](skills/next/SKILL.md)")).toEqual(expected);
		expect(parseSkill("curtain:next")).toEqual(expected);
		expect(parseSkill("/curtain:next")).toEqual(expected);
		expect(parseSkill("$curtain:next")).toEqual(expected);
		expect(parseSkill("[$curtain:next]")).toEqual(expected);
		expect(parseSkill("[$curtain:next](skills/next/SKILL.md)")).toEqual(
			expected,
		);
		expect(parseSkill("  NEXT  ")).toEqual(expected);
	});

	it("parses curtain:curtain in various representations", () => {
		const expected = { namespace: "curtain", name: "curtain" };
		expect(parseSkill("curtain")).toEqual(expected);
		expect(parseSkill("/curtain")).toEqual(expected);
		expect(parseSkill("$curtain")).toEqual(expected);
		expect(parseSkill("[$curtain]")).toEqual(expected);
		expect(parseSkill("[curtain]")).toEqual(expected);
		expect(parseSkill("[$curtain](skills/curtain/SKILL.md)")).toEqual(expected);
		expect(parseSkill("curtain:curtain")).toEqual(expected);
		expect(parseSkill("/curtain:curtain")).toEqual(expected);
		expect(parseSkill("$curtain:curtain")).toEqual(expected);
		expect(parseSkill("[$curtain:curtain]")).toEqual(expected);
		expect(parseSkill("  CURTAIN  ")).toEqual(expected);
	});

	it("returns null for removed or invalid curtain commands", () => {
		expect(parseSkill("curtain:start")).toBeNull();
		expect(parseSkill("$curtain:start")).toBeNull();
		expect(parseSkill("/curtain:start")).toBeNull();
		expect(parseSkill("curtain:run")).toBeNull();
		expect(parseSkill("$curtain:run")).toBeNull();
		expect(parseSkill("/curtain:run")).toBeNull();
		expect(parseSkill("curtain:unknown")).toBeNull();
	});

	it("parses foreign plugins and namespaced skills", () => {
		expect(parseSkill("other-plugin:next")).toEqual({
			namespace: "other-plugin",
			name: "next",
		});
		expect(parseSkill("/other-plugin:next")).toEqual({
			namespace: "other-plugin",
			name: "next",
		});
		expect(parseSkill("$plugin:custom")).toEqual({
			namespace: "plugin",
			name: "custom",
		});
		expect(parseSkill("[$plugin:custom](url)")).toEqual({
			namespace: "plugin",
			name: "custom",
		});
	});

	it("parses bare custom skills", () => {
		expect(parseSkill("my-skill")).toEqual({ name: "my-skill" });
		expect(parseSkill("/my-skill")).toEqual({ name: "my-skill" });
		expect(parseSkill("$my-skill")).toEqual({ name: "my-skill" });
		expect(parseSkill("[$my-skill]")).toEqual({ name: "my-skill" });
		expect(parseSkill("[$my-skill](path/to/skill)")).toEqual({
			name: "my-skill",
		});
	});

	it("returns null for empty or invalid format", () => {
		expect(parseSkill("")).toBeNull();
		expect(parseSkill("   ")).toBeNull();
		expect(parseSkill("a:b:c")).toBeNull();
		expect(parseSkill("a:")).toBeNull();
		expect(parseSkill(":b")).toBeNull();
	});
});

describe("formatSkill", () => {
	it("formats namespaced skills", () => {
		expect(formatSkill({ namespace: "curtain", name: "next" })).toBe(
			"curtain:next",
		);
		expect(formatSkill({ namespace: "curtain", name: "curtain" })).toBe(
			"curtain:curtain",
		);
		expect(formatSkill({ namespace: "other", name: "custom" })).toBe(
			"other:custom",
		);
	});

	it("formats bare skills without namespace", () => {
		expect(formatSkill({ name: "deploy" })).toBe("deploy");
		expect(formatSkill({ name: "test-runner" })).toBe("test-runner");
	});
});

describe("normalizeSkillName", () => {
	it("normalizes commands to canonical string", () => {
		expect(normalizeSkillName("next")).toBe("curtain:next");
		expect(normalizeSkillName("/next")).toBe("curtain:next");
		expect(normalizeSkillName("$next")).toBe("curtain:next");
		expect(normalizeSkillName("curtain")).toBe("curtain:curtain");
		expect(normalizeSkillName("/curtain")).toBe("curtain:curtain");
		expect(normalizeSkillName("[$curtain:next]")).toBe("curtain:next");
		expect(normalizeSkillName("custom-skill")).toBe("custom-skill");
		expect(normalizeSkillName("other:custom")).toBe("other:custom");
		expect(normalizeSkillName("curtain:start")).toBe("");
		expect(normalizeSkillName("")).toBe("");
	});
});
