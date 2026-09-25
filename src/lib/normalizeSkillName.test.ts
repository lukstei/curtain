import { describe, expect, it } from "vitest";
import { normalizeSkillName } from "./normalizeSkillName.ts";

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
