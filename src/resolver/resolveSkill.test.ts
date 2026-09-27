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

			const resolved = resolveSkillPath({ name: "deploy" }, "agy", [testDir]);
			expect(resolved).toBe(skillFile);
		});

		it("resolves workspace generic skills in skills/", () => {
			const skillDir = path.join(testDir, "skills/migrate");
			fs.mkdirSync(skillDir, { recursive: true });
			const skillFile = path.join(skillDir, "SKILL.md");
			fs.writeFileSync(skillFile, "# Migrate Skill\n");

			const resolved = resolveSkillPath({ name: "migrate" }, "claude", [
				testDir,
			]);
			expect(resolved).toBe(skillFile);
		});

		it("resolves harness-specific workspace skills for claude in .claude/skills", () => {
			const claudeSkillDir = path.join(testDir, ".claude/skills/review");
			fs.mkdirSync(claudeSkillDir, { recursive: true });
			const claudeSkill = path.join(claudeSkillDir, "SKILL.md");
			fs.writeFileSync(claudeSkill, "# Claude Review\n");

			// Claude finds it
			expect(resolveSkillPath({ name: "review" }, "claude", [testDir])).toBe(
				claudeSkill,
			);

			// Codex does NOT find it (isolation)
			expect(
				resolveSkillPath({ name: "review" }, "codex", [testDir]),
			).toBeNull();
		});

		it("resolves harness-specific workspace skills for codex in .codex/skills", () => {
			const codexSkillDir = path.join(testDir, ".codex/skills/format");
			fs.mkdirSync(codexSkillDir, { recursive: true });
			const codexSkill = path.join(codexSkillDir, "SKILL.md");
			fs.writeFileSync(codexSkill, "# Codex Format\n");

			// Codex finds it
			expect(resolveSkillPath({ name: "format" }, "codex", [testDir])).toBe(
				codexSkill,
			);

			// Claude does NOT find it (isolation)
			expect(
				resolveSkillPath({ name: "format" }, "claude", [testDir]),
			).toBeNull();
		});

		it("handles namespaced skills like plugin:skill-name", () => {
			const skillDir = path.join(testDir, ".agents/skills/test-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			const skillFile = path.join(skillDir, "SKILL.md");
			fs.writeFileSync(skillFile, "# Test Skill\n");

			expect(
				resolveSkillPath(
					{ namespace: "my-plugin", name: "test-skill" },
					"agy",
					[testDir],
				),
			).toBe(skillFile);
		});

		it("resolves skills across multiple workspaces in order", () => {
			const ws1 = path.join(testDir, "ws1");
			const ws2 = path.join(testDir, "ws2");
			fs.mkdirSync(path.join(ws2, "skills/multi-ws"), { recursive: true });
			const skillFile2 = path.join(ws2, "skills/multi-ws/SKILL.md");
			fs.writeFileSync(skillFile2, "# Multi WS Skill\n");

			expect(resolveSkillPath({ name: "multi-ws" }, "agy", [ws1, ws2])).toBe(
				skillFile2,
			);
		});
	});

	describe("resolvePlaybookPath", () => {
		it("resolves direct PLAYBOOK.md path via skill.path", () => {
			const pb = path.join(testDir, "PLAYBOOK.md");
			fs.writeFileSync(pb, "# Playbook\n");
			expect(
				resolvePlaybookPath({ name: "pb", path: pb }, "agy", [testDir]),
			).toBe(pb);
		});

		it("resolves directory containing PLAYBOOK.md via skill.path", () => {
			const dir = path.join(testDir, "my-dir");
			fs.mkdirSync(dir);
			const pb = path.join(dir, "PLAYBOOK.md");
			fs.writeFileSync(pb, "# Playbook\n");
			expect(
				resolvePlaybookPath({ name: "my-dir", path: dir }, "agy", [testDir]),
			).toBe(pb);
		});

		it("resolves ParsedSkill to adjacent PLAYBOOK.md", () => {
			const skillDir = path.join(testDir, ".agents/skills/deploy");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Deploy\n");
			const pb = path.join(skillDir, "PLAYBOOK.md");
			fs.writeFileSync(pb, "# Playbook\n");

			expect(resolvePlaybookPath({ name: "deploy" }, "agy", [testDir])).toBe(
				pb,
			);
			expect(
				resolvePlaybookPath(
					{ name: "deploy", path: path.join(skillDir, "SKILL.md") },
					"agy",
					[testDir],
				),
			).toBe(pb);
		});

		it("returns null for non-PLAYBOOK.md files or nonexistent skills", () => {
			const other = path.join(testDir, "other.md");
			fs.writeFileSync(other, "# Other\n");
			expect(
				resolvePlaybookPath({ name: "other", path: other }, "agy", [testDir]),
			).toBeNull();
			expect(
				resolvePlaybookPath({ name: "nonexistent" }, "agy", [testDir]),
			).toBeNull();
		});

		it("resolves relative playbook path across multiple workspace roots", () => {
			const ws1 = path.join(testDir, "ws1");
			const ws2 = path.join(testDir, "ws2");
			fs.mkdirSync(ws1, { recursive: true });
			fs.mkdirSync(ws2, { recursive: true });
			const pb2 = path.join(ws2, "PLAYBOOK.md");
			fs.writeFileSync(pb2, "# Custom Playbook\n");

			expect(
				resolvePlaybookPath({ name: "custom", path: "PLAYBOOK.md" }, "agy", [
					ws1,
					ws2,
				]),
			).toBe(pb2);
		});

		it("resolves curtain-adopt skill playbook in workspace skills directory", () => {
			const projectRoot = process.cwd();
			const resolved = resolvePlaybookPath({ name: "curtain-adopt" }, "agy", [
				projectRoot,
			]);
			expect(resolved).toBe(
				path.join(projectRoot, "skills/curtain-adopt/PLAYBOOK.md"),
			);
		});

		it("resolves curtain-eject skill playbook in workspace skills directory", () => {
			const projectRoot = process.cwd();
			const resolved = resolvePlaybookPath({ name: "curtain-eject" }, "agy", [
				projectRoot,
			]);
			expect(resolved).toBe(
				path.join(projectRoot, "skills/curtain-eject/PLAYBOOK.md"),
			);
		});
	});
});
