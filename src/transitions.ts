import assert from "node:assert/strict";
import type { Script, Step } from "./parser.ts";
import type { RunnerState } from "./state.ts";

export type AdvanceResult =
	| { action: "finish" }
	| { action: "pause"; state: RunnerState }
	| { action: "advance"; state: RunnerState; step: Step };

export type ResumeResult =
	| { success: true; state: RunnerState; step: Step }
	| { success: false; error: string };

/**
 * Initializes and starts execution of a script at step 0.
 */
export function startExecution(script: Script): RunnerState {
	assert(script.steps.length > 0, "Cannot start script with no steps");

	return {
		script: script.filePath,
		status: "running",
		currentStep: 0,
		totalSteps: script.steps.length,
		steps: script.steps,
	};
}

/**
 * Resumes execution from a paused gate to the next step (e.g. via /curtain raise).
 */
export function resumeExecution(state: RunnerState): ResumeResult {
	assert(state, "State must be provided to resume");

	if (state.status !== "paused") {
		return {
			success: false,
			error: "The curtain is not currently paused.",
		};
	}

	const nextStepIndex = state.currentStep + 1;
	if (nextStepIndex >= state.totalSteps) {
		return {
			success: false,
			error: "All steps have already been completed.",
		};
	}

	const nextStep = state.steps[nextStepIndex];
	return {
		success: true,
		state: {
			...state,
			currentStep: nextStepIndex,
			status: "running",
		},
		step: nextStep,
	};
}

/**
 * Evaluates execution progression on agent turn completion (Stop hook).
 */
export function advanceExecution(state: RunnerState): AdvanceResult {
	assert(state, "State must be provided to advance");
	assert(state.status === "running", "Cannot advance when not running");

	const nextStepIndex = state.currentStep + 1;
	if (nextStepIndex >= state.totalSteps) {
		return { action: "finish" };
	}

	const nextStep = state.steps[nextStepIndex];
	if (nextStep.type === "pause") {
		return {
			action: "pause",
			state: {
				...state,
				status: "paused",
			},
		};
	}

	return {
		action: "advance",
		state: {
			...state,
			currentStep: nextStepIndex,
			status: "running",
		},
		step: nextStep,
	};
}
