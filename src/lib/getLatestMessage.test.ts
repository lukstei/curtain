import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAgyMessage } from "../harnesses/agy.ts";
import { parseClaudeMessage } from "../harnesses/common.ts";
import { getLatestMessage } from "./getLatestMessage.ts";

describe("getLatestMessage", () => {
	it("extracts latest USER_INPUT and PLANNER_RESPONSE", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-test-msg-"));
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
});
