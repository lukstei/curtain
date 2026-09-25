import { TERMINATION_CANCEL_REGEX } from "../regex.ts";
import { deleteState, type RunnerState, saveState } from "../state.ts";
import { advanceExecution, formatStepPrompt } from "../transitions.ts";
import type { HookInfo, StopHookResponse } from "../types.ts";
import type { HandlerResult } from "./pre.ts";

export function handleStop(
	info: Extract<HookInfo, { type: "stop" }>,
	state: RunnerState | null,
	env: NodeJS.ProcessEnv = process.env,
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
		deleteState(info.conversationId, env);
		return { state: null, response: { action: "allow" } };
	}

	if (result.action === "pause") {
		saveState(info.conversationId, result.state, env);
		return { state: result.state, response: { action: "allow" } };
	}

	saveState(info.conversationId, result.state, env);
	const msg = formatStepPrompt(result.step, result.state.steps.length);
	return {
		state: result.state,
		response: {
			action: "continue",
			reason: msg,
		},
	};
}
