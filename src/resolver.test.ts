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
		scriptPath = path.join(tmpDir, "sample.md");
		fs.writeFileSync(scriptPath, "# Sample Script\n\nStep 1");
	});

	afterAll(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("resolveScriptPath handles mentions, quotes, and extensionless paths", () => {
		const results = [
			resolveScriptPath(`@[${scriptPath}]`),
			resolveScriptPath(`@${scriptPath}`),
			resolveScriptPath(`"${scriptPath}"`),
			resolveScriptPath(`'${scriptPath}'`),
			resolveScriptPath(path.join(tmpDir, "sample")),
			resolveScriptPath("nonexistent/file.md"),
		].map((p) => (p ? stripAbsolutePath(p, tmpDir) : null));

		expect(results).toMatchInlineSnapshot(`
			[
			  "sample.md",
			  "sample.md",
			  "sample.md",
			  "sample.md",
			  "sample.md",
			  null,
			]
		`);
	});

	it("resolveScriptPath resolves across workspace paths and absolute paths", () => {
		const fromAbs = resolveScriptPath(scriptPath);
		const fromWs = resolveScriptPath("sample.md", [tmpDir]);

		expect([
			fromAbs ? stripAbsolutePath(fromAbs, tmpDir) : null,
			fromWs ? stripAbsolutePath(fromWs, tmpDir) : null,
		]).toMatchInlineSnapshot(`
			[
			  "sample.md",
			  "sample.md",
			]
		`);
	});
});
