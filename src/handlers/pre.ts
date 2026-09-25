import type { HarnessType } from "../harnesses/types.ts";
import { assertNever } from "../lib/assertNever.ts";
import { parseCommand, type UserIntent } from "../lib/parseCommand.ts";
import type { Script } from "../parser/index.ts";
import { resolveIntentScript } from "../resolver/index.ts";
import type { RunnerState } from "../state.ts";
import {
	executeResume,
	executeStart,
	formatIntermissionPrompt,
} from "../transitions.ts";
import type {
	HookInfo,
	PreHookResponse,
	ResolvedScriptResult,
} from "../types.ts";

export interface HandlerResult<T = PreHookResponse> {
	state: RunnerState | null;
	response: T;
}

function startScript(
	script: Script,
	skillName?: string,
): HandlerResult<PreHookResponse> {
	const res = executeStart(script, skillName);
	return {
		state: res.nextState,
		response: { action: "inject", message: res.message },
	};
}

/**
 * Isolated side-effect function: resolves script associated with pre intent.
 */
function resolvePreScript(
	intent: UserIntent,
	info: Extract<HookInfo, { type: "pre" }>,
	state: RunnerState | null,
): ResolvedScriptResult | undefined {
	if (intent.type === "run" || (intent.type === "skill" && !state)) {
		return resolveIntentScript(
			intent,
			info.workspacePath,
			info.harness as HarnessType | undefined,
		);
	}
	return undefined;
}

/**
 * Pure evaluation function: computes next state and response given intent and resolved script.
 */
export function evaluatePreIntent(
	intent: UserIntent,
	state: RunnerState | null,
	resolved?: ResolvedScriptResult,
): HandlerResult<PreHookResponse> {
	switch (intent.type) {
		case "error":
			return { state, response: { action: "inject", message: intent.error } };

		case "next": {
			if (!state) {
				return {
					state: null,
					response: {
						action: "inject",
						message: "No script is currently loaded.",
					},
				};
			}

			const res = executeResume(state);
			return {
				state: res.nextState,
				response: { action: "inject", message: res.message },
			};
		}

		case "run": {
			if (!resolved || resolved.type === "none") {
				return {
					state,
					response: {
						action: "inject",
						message: `Script file not found: "${intent.path}"`,
					},
				};
			}
			if (resolved.type === "error") {
				return {
					state,
					response: { action: "inject", message: resolved.error },
				};
			}
			return startScript(resolved.script);
		}

		case "skill": {
			if (state) break;

			if (resolved?.type === "resolved") {
				return startScript(
					resolved.script,
					resolved.skillName ?? intent.skill?.name,
				);
			}
			break;
		}

		case "none":
			break;

		default:
			assertNever(intent);
	}

	if (state?.status === "paused") {
		const currentStep = state.steps[state.currentStep];
		return {
			state,
			response: {
				action: "inject",
				message: formatIntermissionPrompt(currentStep?.instruction),
			},
		};
	}

	return { state, response: { action: "pass" } };
}

export function handlePre(
	info: Extract<HookInfo, { type: "pre" }>,
	state: RunnerState | null,
): HandlerResult<PreHookResponse> {
	const intent = parseCommand(info.prompt, info.skillInvocationPath);
	const resolved = resolvePreScript(intent, info, state);
	return evaluatePreIntent(intent, state, resolved);
}
