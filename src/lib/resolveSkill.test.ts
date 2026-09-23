import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasCurtainAnnotations, resolveSkillPath } from "./resolveSkill.ts";

describe("lib/resolveSkill.ts", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = path.join(os.tmpdir(), `curtain-skill-test-${Date.now()}`);
		fs.mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(testDir, { recursive: true, force: true });
	});

	describe("hasCurtainAnnotations", () => {
		it("detects > [!CURTAIN] callouts", () => {
			const filePath = path.join(testDir, "annotated.md");
			fs.writeFileSync(
				filePath,
				"# Title\nStep 1\n> [!CURTAIN]\nStep 2\n",
				"utf-8",
			);
			expect(hasCurtainAnnotations(filePath)).toBe(true);
		});

		it("detects > [!INTERMISSION] callouts", () => {
			const filePath = path.join(testDir, "intermission.md");
			fs.writeFileSync(
				filePath,
				"# Title\nStep 1\n> [!INTERMISSION] Review\nStep 2\n",
				"utf-8",
			);
			expect(hasCurtainAnnotations(filePath)).toBe(true);
		});

		it("detects callouts at the very start of the file", () => {
			const filePath = path.join(testDir, "start.md");
			fs.writeFileSync(filePath, "> [!CURTAIN]\nStep 2\n", "utf-8");
			expect(hasCurtainAnnotations(filePath)).toBe(true);
		});

		it("detects callouts with arbitrary whitespace around >", () => {
			const filePath = path.join(testDir, "spaces.md");
			fs.writeFileSync(
				filePath,
				"# Title\nStep 1\n   >   [!CURTAIN]\nStep 2\n",
				"utf-8",
			);
			expect(hasCurtainAnnotations(filePath)).toBe(true);
		});

		it("returns false for plain markdown without curtain annotations", () => {
			const filePath = path.join(testDir, "plain.md");
			fs.writeFileSync(
				filePath,
				"# Title\nThis is just a normal doc.\n## Steps\n1. Do this\n",
				"utf-8",
			);
			expect(hasCurtainAnnotations(filePath)).toBe(false);
		});

		it("returns false for non-existent files", () => {
			expect(hasCurtainAnnotations(path.join(testDir, "missing.md"))).toBe(
				false,
			);
		});
	});

	describe("resolveSkillPath", () => {
		it("resolves workspace generic skills in .agents/skills", () => {
			const skillDir = path.join(testDir, ".agents/skills/deploy");
			fs.mkdirSync(skillDir, { recursive: true });
			const skillFile = path.join(skillDir, "SKILL.md");
			fs.writeFileSync(skillFile, "# Deploy Skill\n");

			const resolved = resolveSkillPath("deploy", "agy", testDir);
			expect(resolved).toBe(skillFile);
		});

		it("resolves workspace generic skills in skills/", () => {
			const skillDir = path.join(testDir, "skills/migrate");
			fs.mkdirSync(skillDir, { recursive: true });
			const skillFile = path.join(skillDir, "SKILL.md");
			fs.writeFileSync(skillFile, "# Migrate Skill\n");

			const resolved = resolveSkillPath("migrate", "claude", testDir);
			expect(resolved).toBe(skillFile);
		});

		it("resolves harness-specific workspace skills for claude in .claude/skills", () => {
			const claudeSkillDir = path.join(testDir, ".claude/skills/review");
			fs.mkdirSync(claudeSkillDir, { recursive: true });
			const claudeSkill = path.join(claudeSkillDir, "SKILL.md");
			fs.writeFileSync(claudeSkill, "# Claude Review\n");

			// Claude finds it
			expect(resolveSkillPath("review", "claude", testDir)).toBe(claudeSkill);

			// Codex does NOT find it (isolation)
			expect(resolveSkillPath("review", "codex", testDir)).toBeNull();
		});

		it("resolves harness-specific workspace skills for codex in .codex/skills", () => {
			const codexSkillDir = path.join(testDir, ".codex/skills/format");
			fs.mkdirSync(codexSkillDir, { recursive: true });
			const codexSkill = path.join(codexSkillDir, "SKILL.md");
			fs.writeFileSync(codexSkill, "# Codex Format\n");

			// Codex finds it
			expect(resolveSkillPath("format", "codex", testDir)).toBe(codexSkill);

			// Claude does NOT find it (isolation)
			expect(resolveSkillPath("format", "claude", testDir)).toBeNull();
		});

		it("handles namespaced skills like plugin:skill-name", () => {
			const skillDir = path.join(testDir, ".agents/skills/test-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			const skillFile = path.join(skillDir, "SKILL.md");
			fs.writeFileSync(skillFile, "# Test Skill\n");

			expect(resolveSkillPath("my-plugin:test-skill", "agy", testDir)).toBe(
				skillFile,
			);
		});
	});
});
