import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadState, saveState } from "../state.ts";
import { runShimForTest } from "./runtime-shim.ts";

describe("runShim End-to-End Simulation", () => {
	const tmpDir = path.join(os.tmpdir(), `curtain-shim-test-${Date.now()}`);

	it("processes AGY pre-invocation hook when idle", async () => {
		const rawInput = JSON.stringify({
			conversationId: "test-agy-idle",
			workspacePaths: ["/test"],
		});

		const egress = await runShimForTest("pre", rawInput, {
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

		const egress = await runShimForTest("stop", rawInput, {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
		});
		expect(egress.exitCode).toBe(0);
		expect(JSON.parse(egress.stdout ?? "{}")).toEqual({ decision: "allow" });
	});

	it("processes AGY tool invocation for next skill when paused", async () => {
		const sessionId = "agy-session-1";
		const env = {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
		};
		saveState(
			sessionId,
			{
				script: "sample.md",
				status: "paused",
				currentStep: 0,
				steps: [
					{ index: 0, type: "pause", content: "Step 1" },
					{ index: 1, type: "auto", content: "Step 2" },
				],
			},
			env,
		);

		const rawInput = JSON.stringify({
			conversationId: sessionId,
			workspacePaths: ["/test"],
			toolCall: {
				name: "view_file",
				args: { AbsolutePath: "/test/skills/next/SKILL.md" },
			},
		});

		const egress = await runShimForTest("tool", rawInput, env);

		expect(egress.exitCode).toBe(0);
		const parsed = JSON.parse(egress.stdout ?? "{}");
		expect(parsed.decision).toBe("deny");
		expect(parsed.reason).toContain("[STEP 2 OF 2]");
		expect(loadState(sessionId, env)?.status).toBe("running");
	});

	it("processes AGY stop hook with auto-advancing step", async () => {
		const sessionId = "agy-active-1";
		const env = {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
		};

		saveState(
			sessionId,
			{
				script: "sample.md",
				status: "running",
				currentStep: 0,
				steps: [
					{ index: 0, type: "auto", content: "Step 1 content" },
					{ index: 1, type: "auto", content: "Step 2 content" },
				],
			},
			env,
		);

		const rawInput = JSON.stringify({
			conversationId: sessionId,
			workspacePaths: ["/test"],
			terminationReason: "model_stop",
		});

		const egress = await runShimForTest("stop", rawInput, env);
		expect(egress.exitCode).toBe(0);

		const parsed = JSON.parse(egress.stdout ?? "{}");
		expect(parsed.decision).toBe("continue");
		expect(parsed.reason).toContain("[STEP 2 OF 2]");
		expect(loadState(sessionId, env)?.currentStep).toBe(1);
	});

	it("processes AGY stop hook with pause step (allows stop)", async () => {
		const sessionId = "agy-active-pause-1";
		const env = {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
		};

		saveState(
			sessionId,
			{
				script: "sample.md",
				status: "running",
				currentStep: 0,
				steps: [
					{ index: 0, type: "pause", content: "Step 1 content" },
					{ index: 1, type: "auto", content: "Step 2 content" },
				],
			},
			env,
		);

		const rawInput = JSON.stringify({
			conversationId: sessionId,
			workspacePaths: ["/test"],
			terminationReason: "model_stop",
		});

		const egress = await runShimForTest("stop", rawInput, env);
		expect(egress.exitCode).toBe(0);
		expect(JSON.parse(egress.stdout ?? "{}")).toEqual({ decision: "allow" });
		expect(loadState(sessionId, env)?.status).toBe("paused");
	});

	it("deletes state when stop hook finishes final step", async () => {
		const sessionId = "agy-finish-1";
		const env = {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
		};

		saveState(
			sessionId,
			{
				script: "sample.md",
				status: "running",
				currentStep: 1,
				steps: [
					{ index: 0, type: "auto", content: "Step 1 content" },
					{ index: 1, type: "auto", content: "Step 2 content" },
				],
			},
			env,
		);

		const rawInput = JSON.stringify({
			conversationId: sessionId,
			workspacePaths: ["/test"],
			terminationReason: "model_stop",
		});

		const egress = await runShimForTest("stop", rawInput, env);
		expect(egress.exitCode).toBe(0);
		expect(JSON.parse(egress.stdout ?? "{}")).toEqual({ decision: "allow" });
		expect(loadState(sessionId, env)).toBeNull();
	});

	it("logs hook invocation when CURTAIN_DEBUG is set", async () => {
		const conversationId = "test-log-debug-on";
		const env = {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
			CURTAIN_DEBUG: "1",
		};
		const rawInput = JSON.stringify({
			conversationId,
			workspacePaths: ["/test"],
		});

		await runShimForTest("pre", rawInput, env);
		const hookLogPath = path.join(tmpDir, conversationId, "hooks.jsonl");
		expect(fs.existsSync(hookLogPath)).toBe(true);
		const content = fs.readFileSync(hookLogPath, "utf-8");
		expect(content).toContain('"hook":"pre"');
	});

	it("does not log hook invocation when CURTAIN_DEBUG is unset", async () => {
		const conversationId = "test-log-debug-off";
		const env = {
			AGY_HOOK_ACTIVE: "1",
			AGY_PLUGIN_DATA: tmpDir,
		};
		const rawInput = JSON.stringify({
			conversationId,
			workspacePaths: ["/test"],
		});

		await runShimForTest("pre", rawInput, env);
		const hookLogPath = path.join(tmpDir, conversationId, "hooks.jsonl");
		expect(fs.existsSync(hookLogPath)).toBe(false);
	});
});
