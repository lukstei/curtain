import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveScriptPath } from "./resolver.ts";
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
});
