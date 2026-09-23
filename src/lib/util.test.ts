import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAgyMessage } from "../harnesses/agy.ts";
import { parseClaudeMessage } from "../harnesses/common.ts";
import { getLatestMessage } from "./getLatestMessage.ts";
import { logDebug } from "./logDebug.ts";

describe("util library functions", () => {
	it("getLatestMessage extracts latest USER_INPUT and PLANNER_RESPONSE", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-test-util-"));
		const transcriptPath = path.join(tmpDir, "transcript.jsonl");

		const lines = [
			JSON.stringify({
				step_index: 0,
				source: "USER_EXPLICIT",
				type: "USER_INPUT",
				content: "/curtain run test.md",
			}),
			JSON.stringify({
				step_index: 1,
				source: "MODEL",
				type: "PLANNER_RESPONSE",
				content: "I will run the command.",
			}),
			JSON.stringify({
				step_index: 2,
				source: "MODEL",
				type: "GENERIC",
				content: "Tool output text...",
			}),
			JSON.stringify({
				step_index: 3,
				source: "MODEL",
				type: "PLANNER_RESPONSE",
				content: "Finished step",
			}),
			"{ corrupted line",
		];

		fs.writeFileSync(transcriptPath, lines.join("\n"), "utf-8");

		const msg = getLatestMessage(transcriptPath);
		expect(msg).toBeDefined();
		expect(msg?.type).toBe("PLANNER_RESPONSE");
		expect(msg?.content).toBe("Finished step");

		// Append user input
		fs.appendFileSync(
			transcriptPath,
			"\n" +
				JSON.stringify({
					step_index: 4,
					source: "USER_EXPLICIT",
					type: "USER_INPUT",
					content: "/next",
				}),
		);

		const nextMsg = getLatestMessage(transcriptPath);
		expect(nextMsg).toBeDefined();
		expect(nextMsg?.type).toBe("USER_INPUT");
		expect(nextMsg?.content).toBe("/next");

		// Append Claude Code style assistant message
		fs.appendFileSync(
			transcriptPath,
			"\n" +
				JSON.stringify({
					role: "assistant",
					message: {
						content: [{ type: "text", text: "Task done" }],
					},
				}),
		);

		const claudeMsg = getLatestMessage(transcriptPath, parseClaudeMessage);
		expect(claudeMsg).toBeDefined();
		expect(claudeMsg?.type).toBe("PLANNER_RESPONSE");
		expect(claudeMsg?.content).toBe("Task done");

		// Test pure parser functions directly
		expect(
			parseAgyMessage({
				step_index: 10,
				source: "MODEL",
				type: "PLANNER_RESPONSE",
				content: "AGY pure",
			}),
		).toEqual({
			type: "PLANNER_RESPONSE",
			content: "AGY pure",
		});

		expect(
			parseClaudeMessage({
				role: "assistant",
				message: { content: [{ type: "text", text: "Claude string content" }] },
			}),
		).toEqual({
			type: "PLANNER_RESPONSE",
			content: "Claude string content",
		});
	});

	it("logDebug writes debug lines when debug flag is active", () => {
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
