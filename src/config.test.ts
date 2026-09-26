import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCurtainConfig } from "./config.ts";

describe("loadCurtainConfig", () => {
	it("returns debug: false when no curtain.json exists", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-cfg-none-"));
		try {
			const config = loadCurtainConfig(tmp);
			expect(config.debug).toBe(false);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("returns debug: true when curtain.json has debug enabled", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-cfg-true-"));
		try {
			fs.writeFileSync(
				path.join(tmp, "curtain.json"),
				JSON.stringify({ debug: true }),
			);
			const config = loadCurtainConfig(tmp);
			expect(config.debug).toBe(true);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("returns debug: false when curtain.json is corrupted", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-cfg-corrupt-"));
		try {
			fs.writeFileSync(path.join(tmp, "curtain.json"), "invalid json");
			const config = loadCurtainConfig(tmp);
			expect(config.debug).toBe(false);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
