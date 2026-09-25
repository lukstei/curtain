import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSkillScript, resolveScriptPath } from "./resolver.ts";
import { stripAbsolutePath } from "./test-utils.ts";

describe("resolver.ts", () => {
	let tmpDir: string;
	let scriptPath: string;
	let customPath: string;
	let nonMdPath: string;

	beforeAll(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-resolver-test-"));
		scriptPath = path.join(tmpDir, "PLAYBOOK.md");
		fs.writeFileSync(scriptPath, "# Sample Script\n\nStep 1");
		customPath = path.join(tmpDir, "custom.md");
		fs.writeFileSync(customPath, "# Custom Script\n\nStep 1");
		nonMdPath = path.join(tmpDir, "script.ts");
		fs.writeFileSync(nonMdPath, "console.log('not markdown');");
	});

	afterAll(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("resolveScriptPath handles mentions, quotes, directories, custom markdown, and rejects non-markdown", () => {
		const results = [
			resolveScriptPath(`@[${scriptPath}]`),
			resolveScriptPath(`@${scriptPath}`),
			resolveScriptPath(`"${scriptPath}"`),
			resolveScriptPath(`'${scriptPath}'`),
			resolveScriptPath(tmpDir),
			resolveScriptPath(`@[${customPath}]`),
			resolveScriptPath(customPath),
			resolveScriptPath(nonMdPath),
			resolveScriptPath("sample.md"),
			resolveScriptPath("nonexistent/file.md"),
		].map((p) => (p ? stripAbsolutePath(p, tmpDir) : null));

		expect(results).toMatchInlineSnapshot(`
			[
			  "PLAYBOOK.md",
			  "PLAYBOOK.md",
			  "PLAYBOOK.md",
			  "PLAYBOOK.md",
			  "PLAYBOOK.md",
			  "custom.md",
			  "custom.md",
			  null,
			  null,
			  null,
			]
		`);
	});

	it("resolveScriptPath resolves across workspace paths and absolute paths", () => {
		const fromAbs = resolveScriptPath(scriptPath);
		const fromWs = resolveScriptPath("PLAYBOOK.md", [tmpDir]);
		const fromWsDir = resolveScriptPath(".", [tmpDir]);

		expect([
			fromAbs ? stripAbsolutePath(fromAbs, tmpDir) : null,
			fromWs ? stripAbsolutePath(fromWs, tmpDir) : null,
			fromWsDir ? stripAbsolutePath(fromWsDir, tmpDir) : null,
		]).toMatchInlineSnapshot(`
			[
			  "PLAYBOOK.md",
			  "PLAYBOOK.md",
			  "PLAYBOOK.md",
			]
		`);
	});

	describe("loadSkillScript", () => {
		it("loads multi-step script from annotated playbook path or skill directory", () => {
			const skillDir = path.join(tmpDir, "skills", "my-annotated-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				"---\nname: my-annotated-skill\n---\n/curtain my-annotated-skill",
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
});
