import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePlaybookPath, resolveSkillPath } from "./resolveSkill.ts";

describe("lib/resolveSkill.ts", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = path.join(os.tmpdir(), `curtain-skill-test-${Date.now()}`);
		fs.mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(testDir, { recursive: true, force: true });
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

	describe("resolvePlaybookPath", () => {
		it("resolves direct PLAYBOOK.md path", () => {
			const pb = path.join(testDir, "PLAYBOOK.md");
			fs.writeFileSync(pb, "# Playbook\n");
			expect(resolvePlaybookPath(pb, undefined, testDir)).toBe(pb);
			expect(resolvePlaybookPath("PLAYBOOK.md", undefined, testDir)).toBe(pb);
		});

		it("resolves directory containing PLAYBOOK.md", () => {
			const dir = path.join(testDir, "my-dir");
			fs.mkdirSync(dir);
			const pb = path.join(dir, "PLAYBOOK.md");
			fs.writeFileSync(pb, "# Playbook\n");
			expect(resolvePlaybookPath(dir, undefined, testDir)).toBe(pb);
			expect(resolvePlaybookPath("my-dir", undefined, testDir)).toBe(pb);
		});

		it("resolves skill name to adjacent PLAYBOOK.md", () => {
			const skillDir = path.join(testDir, ".agents/skills/deploy");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Deploy\n");
			const pb = path.join(skillDir, "PLAYBOOK.md");
			fs.writeFileSync(pb, "# Playbook\n");

			expect(resolvePlaybookPath("deploy", "agy", testDir)).toBe(pb);
		});

		it("returns null for non-PLAYBOOK.md files", () => {
			const other = path.join(testDir, "other.md");
			fs.writeFileSync(other, "# Other\n");
			expect(resolvePlaybookPath(other, undefined, testDir)).toBeNull();
		});
	});
});
