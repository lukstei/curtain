import { describe, expect, it } from "vitest";
import { formatSkill, normalizeSkillName, parseSkill } from "./parseSkill.ts";

describe("parseSkill", () => {
	it("parses curtain:next in various representations", () => {
		const expected = { namespace: "curtain", name: "next" };
		expect(parseSkill("next")).toBeNull();
		expect(parseSkill("/next")).toEqual(expected);
		expect(parseSkill("$next")).toEqual(expected);
		expect(parseSkill("[$next]")).toEqual(expected);
		expect(parseSkill("[next]")).toBeNull();
		expect(parseSkill("[$next](skills/next/SKILL.md)")).toEqual(expected);
		expect(parseSkill("curtain:next")).toEqual(expected);
		expect(parseSkill("/curtain:next")).toEqual(expected);
		expect(parseSkill("$curtain:next")).toEqual(expected);
		expect(parseSkill("[$curtain:next]")).toEqual(expected);
		expect(parseSkill("[$curtain:next](skills/next/SKILL.md)")).toEqual(
			expected,
		);
		expect(parseSkill("  NEXT  ")).toBeNull();
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

	it("parses custom skills with sigil or markdown", () => {
		expect(parseSkill("my-skill")).toBeNull();
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
		expect(parseSkill("[TODO]")).toBeNull();
		expect(parseSkill("[TODO] Fix auth bug")).toBeNull();
		expect(parseSkill("[WIP]")).toBeNull();
	});
});

describe("formatSkill", () => {
	it("formats namespaced skills", () => {
		expect(formatSkill({ namespace: "curtain", name: "next" })).toBe(
			"curtain:next",
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
	it("normalizes next variations to curtain:next", () => {
		expect(normalizeSkillName("next")).toBe("");
		expect(normalizeSkillName("/next")).toBe("curtain:next");
		expect(normalizeSkillName("$next")).toBe("curtain:next");
		expect(normalizeSkillName("[$next]")).toBe("curtain:next");
		expect(normalizeSkillName("[next]")).toBe("");
		expect(normalizeSkillName("curtain:next")).toBe("curtain:next");
		expect(normalizeSkillName("/curtain:next")).toBe("curtain:next");
		expect(normalizeSkillName("$curtain:next")).toBe("curtain:next");
		expect(normalizeSkillName("[$curtain:next]")).toBe("curtain:next");
		expect(normalizeSkillName("  NEXT  ")).toBe("");
	});

	it("preserves foreign namespaces without collision", () => {
		expect(normalizeSkillName("other-plugin:next")).toBe("other-plugin:next");
		expect(normalizeSkillName("/other-plugin:next")).toBe("other-plugin:next");
		expect(normalizeSkillName("other-plugin:curtain")).toBe(
			"other-plugin:curtain",
		);
		expect(normalizeSkillName("custom:curtain-test")).toBe(
			"custom:curtain-test",
		);
	});

	it("preserves custom skill names with sigils or markdown", () => {
		expect(normalizeSkillName("/curtain-test")).toBe("curtain-test");
		expect(normalizeSkillName("$curtain-test")).toBe("curtain-test");
		expect(normalizeSkillName("[$my-skill]")).toBe("my-skill");
	});

	it("returns empty string for bare identifiers without sigil or namespace", () => {
		expect(normalizeSkillName("curtain-test")).toBe("");
		expect(normalizeSkillName("my-skill")).toBe("");
	});

	it("handles empty or whitespace strings", () => {
		expect(normalizeSkillName("")).toBe("");
		expect(normalizeSkillName("   ")).toBe("");
	});
});
