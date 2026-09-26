/** Detects cancellation, abort, or interrupt in termination reasons. */
export const TERMINATION_CANCEL_REGEX = /cancel|abort|interrupt/i;

import type { RunnerState } from "../state.ts";
import { advanceExecution, formatStepPrompt } from "../transitions.ts";
import type { HookInfo, StopHookResponse } from "../types.ts";
import type { HandlerResult } from "./pre.ts";

export function handleStop(
	info: Extract<HookInfo, { type: "stop" }>,
	state: RunnerState | null,
): HandlerResult<StopHookResponse> {
	if (!state) {
		return { state: null, response: { action: "allow" } };
	}

	// edge case: stop hook triggered while already waiting for human review at an intermission
	if (state.status === "paused") {
		return { state, response: { action: "allow" } };
	}

	// edge case: user or system aborted or cancelled turn, so do not auto-advance execution
	if (
		info.terminationReason &&
		TERMINATION_CANCEL_REGEX.test(info.terminationReason)
	) {
		return { state, response: { action: "allow" } };
	}

	const result = advanceExecution(state);

	if (result.action === "finish") {
		return { state: null, response: { action: "allow" } };
	}

	if (result.action === "pause") {
		return { state: result.state, response: { action: "allow" } };
	}

	const msg = formatStepPrompt(result.step, result.state.steps.length);
	return {
		state: result.state,
		response: {
			action: "continue",
			reason: msg,
		},
	};
}
