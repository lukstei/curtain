import { deleteState, type RunnerState, saveState } from "../state.ts";
import { advanceExecution } from "../transitions.ts";
import type { HookInfo } from "../types.ts";
import type { HandlerResult } from "./pre.ts";

export function handleStop(
	info: HookInfo,
	state: RunnerState | null,
	env: NodeJS.ProcessEnv = process.env,
): HandlerResult {
	if (!state) {
		return { state: null, response: { decision: "allow" } };
	}

	if (state.status === "paused") {
		return { state, response: { decision: "allow" } };
	}

	if (
		info.terminationReason &&
		/cancel|abort|interrupt/i.test(info.terminationReason)
	) {
		return { state, response: { decision: "allow" } };
	}

	const result = advanceExecution(state);

	if (result.action === "finish") {
		deleteState(info.conversationId, env);
		return { state: null, response: { decision: "allow" } };
	}

	if (result.action === "pause") {
		saveState(info.conversationId, result.state, env);
		return { state: result.state, response: { decision: "allow" } };
	}

	saveState(info.conversationId, result.state, env);
	const msg = `[STEP ${result.state.currentStep + 1} OF ${result.state.totalSteps}]\n\n${result.step.content}\n\nPerform ONLY this step. Conclude when complete.`;
	return {
		state: result.state,
		response: {
			decision: "continue",
			reason: msg,
		},
	};
}
