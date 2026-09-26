import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	loadSkillScript,
	resolveIntentScript,
	resolvePlaybookPath,
} from "./index.ts";

describe("resolver.ts", () => {
	let tmpDir: string;
	let scriptPath: string;

	beforeAll(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-resolver-test-"));
		scriptPath = path.join(tmpDir, "PLAYBOOK.md");
		fs.writeFileSync(scriptPath, "# Sample Script\n\nStep 1");
	});

	afterAll(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe("resolvePlaybookPath", () => {
		it("resolves direct PLAYBOOK.md and directories containing PLAYBOOK.md", () => {
			expect(resolvePlaybookPath(scriptPath, undefined, tmpDir)).toBe(
				scriptPath,
			);
			expect(resolvePlaybookPath(tmpDir, undefined, tmpDir)).toBe(scriptPath);
			expect(resolvePlaybookPath("PLAYBOOK.md", undefined, tmpDir)).toBe(
				scriptPath,
			);
			expect(
				resolvePlaybookPath("nonexistent.md", undefined, tmpDir),
			).toBeNull();
		});
	});

	describe("loadSkillScript", () => {
		it("loads multi-step script from annotated playbook path or skill directory", () => {
			const skillDir = path.join(tmpDir, "skills", "my-annotated-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				"---\nname: my-annotated-skill\n---\nWorkflow description",
			);
			fs.writeFileSync(
				path.join(skillDir, "PLAYBOOK.md"),
				"# Test Skill\n\nStep 1\n\n> [!CURTAIN]\n\nStep 2",
			);

			const scriptFromDir = loadSkillScript(skillDir, tmpDir);
			expect(scriptFromDir).not.toBeNull();
			expect(scriptFromDir?.steps.length).toBe(2);

			const scriptFromSkillMd = loadSkillScript(
				path.join(skillDir, "SKILL.md"),
				tmpDir,
			);
			expect(scriptFromSkillMd).not.toBeNull();
			expect(scriptFromSkillMd?.steps.length).toBe(2);
		});

		it("returns null when playbook lacks curtain annotations", () => {
			const unannotatedDir = path.join(tmpDir, "skills", "unannotated");
			fs.mkdirSync(unannotatedDir, { recursive: true });
			fs.writeFileSync(
				path.join(unannotatedDir, "PLAYBOOK.md"),
				"# Regular Playbook\n\nStep 1 without callouts\nStep 2",
			);

			expect(loadSkillScript(unannotatedDir, tmpDir)).toBeNull();
		});

		it("returns null for empty, null, or nonexistent target", () => {
			expect(loadSkillScript("")).toBeNull();
			expect(loadSkillScript(null)).toBeNull();
			expect(loadSkillScript(undefined)).toBeNull();
			expect(loadSkillScript("nonexistent-skill-target", tmpDir)).toBeNull();
		});
	});

	describe("resolveIntentScript", () => {
		it("resolves skill for skill intent when annotated playbook exists", () => {
			const skillDir = path.join(
				tmpDir,
				".agents",
				"skills",
				"test-intent-skill",
			);
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				"---\nname: test-intent-skill\n---\nWorkflow description",
			);
			fs.writeFileSync(
				path.join(skillDir, "PLAYBOOK.md"),
				"# Step 1\n> [!CURTAIN]\n# Step 2",
			);

			const res = resolveIntentScript(
				{
					type: "skill",
					skill: { name: "test-intent-skill" },
				},
				tmpDir,
			);
			expect(res.type).toBe("resolved");
			if (res.type === "resolved") {
				expect(res.script.steps.length).toBe(2);
				expect(res.skillName).toBe("test-intent-skill");
			}
		});

		it("returns none for other intent types", () => {
			expect(resolveIntentScript({ type: "next" }, tmpDir)).toEqual({
				type: "none",
			});
			expect(resolveIntentScript({ type: "none" }, tmpDir)).toEqual({
				type: "none",
			});
		});
	});
});
