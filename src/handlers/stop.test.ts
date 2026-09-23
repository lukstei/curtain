import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunnerState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { handleStop } from "./stop.ts";

describe("handlers/stop.ts", () => {
	const tmpDir = path.join(os.tmpdir(), `curtain-stop-test-${Date.now()}`);
	const env = { AGY_PLUGIN_DATA: tmpDir };

	it("allows stop when state is null", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "c1",
			workspacePath: "/test",
		};
		const { state, response } = handleStop(info, null, env);
		expect(state).toBeNull();
		expect(response).toEqual({ decision: "allow" });
	});

	it("allows stop when status is paused", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "c2",
			workspacePath: "/test",
		};
		const pausedState: RunnerState = {
			script: "sample.md",
			status: "paused",
			currentStep: 0,
			totalSteps: 2,
			steps: [
				{ index: 0, type: "pause", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2" },
			],
		};
		const { state, response } = handleStop(info, pausedState, env);
		expect(state?.status).toBe("paused");
		expect(response).toEqual({ decision: "allow" });
	});

	it("transitions to paused and allows stop when current step type is pause", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "c3",
			workspacePath: "/test",
		};
		const runningState: RunnerState = {
			script: "sample.md",
			status: "running",
			currentStep: 0,
			totalSteps: 2,
			steps: [
				{ index: 0, type: "pause", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2" },
			],
		};
		const { state, response } = handleStop(info, runningState, env);
		expect(state?.status).toBe("paused");
		expect(response).toEqual({ decision: "allow" });
	});

	it("auto-advances and blocks stop when current step type is auto", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "c4",
			workspacePath: "/test",
		};
		const runningState: RunnerState = {
			script: "sample.md",
			status: "running",
			currentStep: 0,
			totalSteps: 2,
			steps: [
				{ index: 0, type: "auto", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2 instruction" },
			],
		};
		const { state, response } = handleStop(info, runningState, env);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(1);
		expect(response).toMatchInlineSnapshot(`
			{
			  "decision": "continue",
			  "reason": "[STEP 2 OF 2]

			Step 2 instruction

			Perform ONLY this step. Conclude when complete.",
			}
		`);
	});

	it("finishes and unlinks state when concluding final step", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "c5",
			workspacePath: "/test",
		};
		const runningState: RunnerState = {
			script: "sample.md",
			status: "running",
			currentStep: 1,
			totalSteps: 2,
			steps: [
				{ index: 0, type: "auto", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2" },
			],
		};
		const { state, response } = handleStop(info, runningState, env);
		expect(state).toBeNull();
		expect(response).toEqual({ decision: "allow" });
	});
});
