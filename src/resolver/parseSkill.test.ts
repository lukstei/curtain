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
	it("normalizes next variations to curtain:next", () => {
		expect(normalizeSkillName("next")).toBe("curtain:next");
		expect(normalizeSkillName("/next")).toBe("curtain:next");
		expect(normalizeSkillName("$next")).toBe("curtain:next");
		expect(normalizeSkillName("[$next]")).toBe("curtain:next");
		expect(normalizeSkillName("[next]")).toBe("curtain:next");
		expect(normalizeSkillName("curtain:next")).toBe("curtain:next");
		expect(normalizeSkillName("/curtain:next")).toBe("curtain:next");
		expect(normalizeSkillName("$curtain:next")).toBe("curtain:next");
		expect(normalizeSkillName("[$curtain:next]")).toBe("curtain:next");
		expect(normalizeSkillName("  NEXT  ")).toBe("curtain:next");
	});

	it("normalizes curtain variations to curtain:curtain", () => {
		expect(normalizeSkillName("curtain")).toBe("curtain:curtain");
		expect(normalizeSkillName("/curtain")).toBe("curtain:curtain");
		expect(normalizeSkillName("$curtain")).toBe("curtain:curtain");
		expect(normalizeSkillName("[$curtain]")).toBe("curtain:curtain");
		expect(normalizeSkillName("curtain:curtain")).toBe("curtain:curtain");
		expect(normalizeSkillName("/curtain:curtain")).toBe("curtain:curtain");
		expect(normalizeSkillName("$curtain:curtain")).toBe("curtain:curtain");
	});

	it("returns empty string for dropped or invalid curtain runner commands", () => {
		expect(normalizeSkillName("$curtain:start")).toBe("");
		expect(normalizeSkillName("curtain:start")).toBe("");
		expect(normalizeSkillName("$curtain:run")).toBe("");
		expect(normalizeSkillName("curtain:run")).toBe("");
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

	it("preserves custom bare skill names", () => {
		expect(normalizeSkillName("curtain-test")).toBe("curtain-test");
		expect(normalizeSkillName("/curtain-test")).toBe("curtain-test");
		expect(normalizeSkillName("$curtain-test")).toBe("curtain-test");
		expect(normalizeSkillName("my-skill")).toBe("my-skill");
	});

	it("handles empty or whitespace strings", () => {
		expect(normalizeSkillName("")).toBe("");
		expect(normalizeSkillName("   ")).toBe("");
	});
});
