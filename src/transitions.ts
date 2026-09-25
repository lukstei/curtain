import assert from "node:assert/strict";
import type { Script, Step } from "./parser.ts";
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
export function startExecution(
	script: Script,
	skillName?: string,
): RunnerState {
	assert(script.steps.length > 0, "Cannot start script with no steps");

	return {
		script: script.filePath,
		status: "running",
		currentStep: 0,
		steps: script.steps,
		...(skillName !== undefined ? { skillName } : {}),
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
	if (nextStepIndex >= state.steps.length) {
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
	if (nextStepIndex >= state.steps.length) {
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
 * Formats prompt injection when an interaction occurs while paused at an intermission review.
 */
export function formatIntermissionPrompt(instruction?: string): string {
	const criteriaPart = instruction ? `${instruction}\n\n` : "";
	return [
		"[INTERMISSION REVIEW]",
		criteriaPart ? criteriaPart.trim() : null,
		"Execution is PAUSED at an intermission for human review.",
		"- Follow and execute all instructions, adjustments, or questions given by the user in their prompt.",
		"- Present your completed work or findings clearly for the user to review, using the review sidebar artifact if applicable.",
		"- Do NOT execute, advance to, or anticipate any DOWNSTREAM or FUTURE steps from the playbook script.",
		"- Remind the user that execution remains paused at this intermission and only typing /next will advance to the next playbook step.",
	]
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Formats step prompt injection with optional delimiter criteria.
 */
export function formatStepPrompt(step: Step, totalSteps: number): string {
	const criteria = step.instruction
		? `[${step.type === "pause" ? "INTERMISSION" : "TRANSITION"} CRITERIA]\n${step.instruction}\n\n`
		: "";
	return `[STEP ${step.index + 1} OF ${totalSteps}]\n\n${step.content}\n\n${criteria}Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.`;
}
