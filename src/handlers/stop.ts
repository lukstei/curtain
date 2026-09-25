import { TERMINATION_CANCEL_REGEX } from "../regex.ts";
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

	if (state.status === "paused") {
		return { state, response: { action: "allow" } };
	}

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
