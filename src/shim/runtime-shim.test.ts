import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { saveState } from "../state.ts";
import { runShim } from "./runtime-shim.ts";

describe("runShim End-to-End Simulation", () => {
	const tmpDir = path.join(os.tmpdir(), `curtain-shim-test-${Date.now()}`);

	it("processes AGY pre-invocation hook when idle", async () => {
		const rawInput = JSON.stringify({
			conversationId: "test-agy-idle",
			workspacePaths: ["/test"],
		});

		const egress = await runShim("pre", rawInput, {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
		});
		expect(egress.exitCode).toBe(0);
		expect(egress.stdout).toBe("{}");
	});

	it("processes AGY stop hook when idle", async () => {
		const rawInput = JSON.stringify({
			conversationId: "test-agy-stop",
			workspacePaths: ["/test"],
			terminationReason: "model_stop",
		});

		const egress = await runShim("stop", rawInput, {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
		});
		expect(egress.exitCode).toBe(0);
		expect(JSON.parse(egress.stdout ?? "{}")).toEqual({ decision: "allow" });
	});

	it("processes Claude Code user prompt submission for /curtain help", async () => {
		const rawInput = JSON.stringify({
			hook_event_name: "UserPromptSubmit",
			session_id: "claude-session-1",
			cwd: "/test",
			prompt: "/curtain help",
		});

		const egress = await runShim("pre", rawInput, {
			CLAUDE_PLUGIN_ROOT: "/plugin",
			CLAUDE_PLUGIN_DATA: tmpDir,
		});

		expect(egress.exitCode).toBe(0);
		const parsed = JSON.parse(egress.stdout ?? "{}");
		expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
		expect(parsed.hookSpecificOutput.additionalContext).toContain(
			"Curtain Commands:",
		);
	});

	it("processes Codex stop hook with auto-advancing step", async () => {
		const sessionId = "codex-active-1";
		const env = { PLUGIN_DATA: tmpDir };

		saveState(
			sessionId,
			{
				script: "sample.md",
				status: "running",
				currentStep: 0,
				totalSteps: 2,
				steps: [
					{ index: 0, type: "auto", content: "Step 1 content" },
					{ index: 1, type: "auto", content: "Step 2 content" },
				],
			},
			env,
		);

		const rawInput = JSON.stringify({
			hookEventName: "Stop",
			session_id: sessionId,
			cwd: "/test",
		});

		const egress = await runShim("stop", rawInput, env);
		expect(egress.exitCode).toBe(0);

		expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
			{
			  "decision": "block",
			  "reason": "[STEP 2 OF 2]

			Step 2 content

			Perform ONLY this step. Conclude when complete.",
			  "suppressOutput": true,
			}
		`);
	});

	it("processes Claude stop hook with pause step (allows stop)", async () => {
		const sessionId = "claude-active-pause-1";
		const env = { CLAUDE_PLUGIN_DATA: tmpDir };

		saveState(
			sessionId,
			{
				script: "sample.md",
				status: "running",
				currentStep: 0,
				totalSteps: 2,
				steps: [
					{ index: 0, type: "pause", content: "Step 1 content" },
					{ index: 1, type: "auto", content: "Step 2 content" },
				],
			},
			env,
		);

		const rawInput = JSON.stringify({
			hook_event_name: "Stop",
			session_id: sessionId,
			cwd: "/test",
		});

		const egress = await runShim("stop", rawInput, env);
		expect(egress.exitCode).toBe(0);
		expect(egress.stdout).toBe("{}");
	});
});
