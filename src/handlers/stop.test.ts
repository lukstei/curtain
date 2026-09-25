import { describe, expect, it } from "vitest";
import type { RunnerState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { handleStop } from "./stop.ts";

describe("handlers/stop.ts", () => {
	it("allows stop when state is null", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "c1",
			workspacePath: "/test",
		};
		const { state, response } = handleStop(info, null);
		expect(state).toBeNull();
		expect(response).toEqual({ action: "allow" });
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
			steps: [
				{ index: 0, type: "pause", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2" },
			],
		};
		const { state, response } = handleStop(info, pausedState);
		expect(state?.status).toBe("paused");
		expect(response).toEqual({ action: "allow" });
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
			steps: [
				{ index: 0, type: "pause", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2" },
			],
		};
		const { state, response } = handleStop(info, runningState);
		expect(state?.status).toBe("paused");
		expect(response).toEqual({ action: "allow" });
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
			steps: [
				{ index: 0, type: "auto", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2 instruction" },
			],
		};
		const { state, response } = handleStop(info, runningState);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(1);
		expect(response).toMatchInlineSnapshot(`
			{
			  "action": "continue",
			  "reason": "[STEP 2 OF 2]

			Step 2 instruction

			Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
			}
		`);
	});

	it("finishes and allows stop when concluding final step", () => {
		const info: HookInfo = {
			type: "stop",
			conversationId: "c5",
			workspacePath: "/test",
		};
		const runningState: RunnerState = {
			script: "sample.md",
			status: "running",
			currentStep: 1,
			steps: [
				{ index: 0, type: "auto", content: "Step 1" },
				{ index: 1, type: "auto", content: "Step 2" },
			],
		};
		const { state, response } = handleStop(info, runningState);
		expect(state).toBeNull();
		expect(response).toEqual({ action: "allow" });
	});
});
