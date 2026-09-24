import assert from "node:assert/strict";
import type { Script, Step } from "./parser.ts";
import { LINE_SPLIT_REGEX } from "./regex.ts";
import type { RunnerState } from "./state.ts";

export type AdvanceResult =
	| { action: "finish" }
	| { action: "pause"; state: RunnerState }
	| { action: "advance"; state: RunnerState; step: Step };

export type ResumeResult =
	| { action: "advance"; state: RunnerState; step: Step }
	| { action: "finish" }
	| { action: "error"; error: string };

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
 * Resumes execution from a paused gate to the next step (e.g. via /next).
 */
export function resumeExecution(state: RunnerState): ResumeResult {
	assert(state, "State must be provided to resume");

	if (state.status !== "paused") {
		return {
			action: "error",
			error: "The curtain is not currently paused.",
		};
	}

	const nextStepIndex = state.currentStep + 1;
	if (nextStepIndex >= state.totalSteps) {
		return { action: "finish" };
	}

	const nextStep = state.steps[nextStepIndex];
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

/**
 * Evaluates execution progression on agent turn completion (Stop hook).
 */
export function advanceExecution(state: RunnerState): AdvanceResult {
	assert(state, "State must be provided to advance");
	assert(state.status === "running", "Cannot advance when not running");

	const currentStep = state.steps[state.currentStep];
	if (currentStep?.type === "pause") {
		return {
			action: "pause",
			state: {
				...state,
				status: "paused",
			},
		};
	}

	const nextStepIndex = state.currentStep + 1;
	if (nextStepIndex >= state.totalSteps) {
		return { action: "finish" };
	}

	const nextStep = state.steps[nextStepIndex];
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

/**
 * Formats step prompt injection with optional delimiter criteria.
 */
export function formatStepPrompt(step: Step, totalSteps: number): string {
	const criteria = step.instruction
		? `[${step.type === "pause" ? "INTERMISSION" : "TRANSITION"} CRITERIA]\n${step.instruction}\n\n`
		: "";
	const pauseNotice =
		step.type === "pause"
			? " When concluding your turn, inform the user that only /next will proceed."
			: "";
	return `[STEP ${step.index + 1} OF ${totalSteps}]\n\n${step.content}\n\n${criteria}Perform ONLY this step. Conclude when complete.${pauseNotice}`;
}

/**
 * Formats runner status output, including intermission instruction if paused.
 */
export function formatStatus(state: RunnerState | null): string {
	if (!state) {
		return "[CURTAIN STATUS] No active script running.";
	}

	const currentStep = state.steps[state.currentStep];
	const firstLineInstruction = currentStep?.instruction
		?.split(LINE_SPLIT_REGEX)[0]
		?.trim();
	const intermissionPart =
		state.status === "paused" && firstLineInstruction
			? ` | Intermission: ${firstLineInstruction}`
			: "";

	return `[CURTAIN STATUS] Step ${state.currentStep + 1}/${state.totalSteps} | State: ${state.status} | Script: ${state.script}${intermissionPart}`;
}
