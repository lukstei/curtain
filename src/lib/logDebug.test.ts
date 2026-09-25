import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { logDebug } from "./logDebug.ts";

describe("logDebug", () => {
	it("writes debug lines when debug flag is active", () => {
		const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-log-test-"));
		const prevEnv = process.env.CURTAIN_DEBUG;
		process.env.CURTAIN_DEBUG = "1";
		process.env.AGY_PLUGIN_DATA = tmpBase;

		try {
			logDebug.conversationId = "conv-xyz";
			logDebug("Hello debug world", { key: "value" });

			const logFile = path.join(tmpBase, "conv-xyz", "debug.log");
			expect(fs.existsSync(logFile)).toBe(true);
			const content = fs.readFileSync(logFile, "utf-8");
			expect(content).toContain("Hello debug world");
			expect(content).toContain('"key": "value"');
		} finally {
			if (prevEnv !== undefined) {
				process.env.CURTAIN_DEBUG = prevEnv;
			} else {
				delete process.env.CURTAIN_DEBUG;
			}
			delete process.env.AGY_PLUGIN_DATA;
		}
	});
});
