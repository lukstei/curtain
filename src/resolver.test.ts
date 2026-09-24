import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveScriptPath } from "./resolver.ts";
import { stripAbsolutePath } from "./test-utils.ts";

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

	it("resolveScriptPath handles mentions, quotes, directories, and rejects non-PLAYBOOK.md", () => {
		const results = [
			resolveScriptPath(`@[${scriptPath}]`),
			resolveScriptPath(`@${scriptPath}`),
			resolveScriptPath(`"${scriptPath}"`),
			resolveScriptPath(`'${scriptPath}'`),
			resolveScriptPath(tmpDir),
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
