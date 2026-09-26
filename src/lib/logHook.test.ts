import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { logHookInvocation } from "./logHook.ts";

describe("logHookInvocation", () => {
	it("appends hook log entries to conversation hooks.jsonl", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-loghook-"));
		const env = { ...process.env, AGY_PLUGIN_DATA: tmp };
		const convId = "test-conv-123";

		try {
			logHookInvocation(
				convId,
				{
					timestamp: "2026-09-26T12:00:00.000Z",
					hook: "pre",
					input: '{"prompt":"/next"}',
					output: '{"injectSteps":[]}',
					latestMessage: { type: "USER_INPUT", content: "/next" },
				},
				env,
			);

			const logFile = path.join(tmp, convId, "hooks.jsonl");
			expect(fs.existsSync(logFile)).toBe(true);

			const lines = fs
				.readFileSync(logFile, "utf-8")
				.trim()
				.split("\n")
				.map((l) => JSON.parse(l));

			expect(lines).toHaveLength(1);
			expect(lines[0]).toEqual({
				timestamp: "2026-09-26T12:00:00.000Z",
				hook: "pre",
				input: '{"prompt":"/next"}',
				output: '{"injectSteps":[]}',
				latestMessage: { type: "USER_INPUT", content: "/next" },
			});
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("serializes runner state when present", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curtain-loghook-"));
		const env = { ...process.env, AGY_PLUGIN_DATA: tmp };
		const convId = "test-conv-state";

		try {
			logHookInvocation(
				convId,
				{
					timestamp: "2026-09-26T12:00:00.000Z",
					hook: "stop",
					input: "{}",
					output: '{"decision":"allow"}',
					state: {
						script: "test.md",
						status: "running",
						currentStep: 1,
						steps: [{ index: 0, type: "auto", content: "hello" }],
					},
				},
				env,
			);

			const logFile = path.join(tmp, convId, "hooks.jsonl");
			const lines = fs
				.readFileSync(logFile, "utf-8")
				.trim()
				.split("\n")
				.map((l) => JSON.parse(l));

			expect(lines[0].state).toEqual({
				script: "test.md",
				status: "running",
				currentStep: 1,
				steps: [{ index: 0, type: "auto", content: "hello" }],
			});
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
