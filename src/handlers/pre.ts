import { getHelpText, parseCommand } from "../lib/parseCommand.ts";
import { loadScript } from "../resolver.ts";
import { deleteState, type RunnerState, saveState } from "../state.ts";
import {
	formatStatus,
	formatStepPrompt,
	resumeExecution,
	startExecution,
} from "../transitions.ts";
import type { HookInfo, HookResponse } from "../types.ts";

export interface HandlerResult {
	state: RunnerState | null;
	response: HookResponse;
}

export function handlePre(
	info: HookInfo,
	state: RunnerState | null,
	env: NodeJS.ProcessEnv = process.env,
): HandlerResult {
	const userInput =
		info.latestMessage?.type === "USER_INPUT"
			? info.latestMessage.content
			: info.prompt;

	if (userInput) {
		const parsed = parseCommand(userInput);
		if (parsed.isCurtainCommand) {
			if (parsed.error) {
				return {
					state,
					response: { injectSteps: [{ ephemeralMessage: parsed.error }] },
				};
			}

			if (!parsed.command || parsed.command.name === "help") {
				return {
					state,
					response: { injectSteps: [{ ephemeralMessage: getHelpText() }] },
				};
			}

			if (parsed.command.name === "status") {
				const msg = formatStatus(state);
				return {
					state,
					response: { injectSteps: [{ ephemeralMessage: msg }] },
				};
			}

			if (parsed.command.name === "drop") {
				deleteState(info.conversationId, env);
				return {
					state: null,
					response: {
						injectSteps: [
							{ ephemeralMessage: "Curtain dropped. Execution stopped." },
						],
					},
				};
			}

			if (parsed.command.name === "raise") {
				if (!state) {
					return {
						state: null,
						response: {
							injectSteps: [
								{ ephemeralMessage: "No script is currently loaded." },
							],
						},
					};
				}

				const res = resumeExecution(state);
				if (res.action === "error") {
					return {
						state,
						response: {
							injectSteps: [{ ephemeralMessage: res.error }],
						},
					};
				}

				if (res.action === "finish") {
					deleteState(info.conversationId, env);
					return {
						state: null,
						response: {
							injectSteps: [
								{ ephemeralMessage: "Curtain raised. Execution complete." },
							],
						},
					};
				}

				saveState(info.conversationId, res.state, env);
				const msg = formatStepPrompt(res.step, res.state.totalSteps);
				return {
					state: res.state,
					response: { injectSteps: [{ ephemeralMessage: msg }] },
				};
			}

			if (parsed.command.name === "run") {
				const loaded = loadScript(parsed.command.path, [info.workspacePath]);
				if (!loaded || "error" in loaded) {
					const err = !loaded
						? `Script file not found: "${parsed.command.path}"`
						: loaded.error;
					return {
						state,
						response: { injectSteps: [{ ephemeralMessage: err }] },
					};
				}

				const nextState = startExecution(loaded.script);
				saveState(info.conversationId, nextState, env);
				const firstStep = nextState.steps[0];
				const msg = formatStepPrompt(firstStep, nextState.totalSteps);
				return {
					state: nextState,
					response: { injectSteps: [{ ephemeralMessage: msg }] },
				};
			}
		}
	}

	if (state?.status === "paused") {
		const currentStep = state.steps[state.currentStep];
		if (currentStep?.instruction) {
			const msg = `[INTERMISSION REVIEW]\n${currentStep.instruction}\n\nConclude your turn when complete. The curtain remains paused until the user enters /curtain raise.`;
			return {
				state,
				response: {
					injectSteps: [{ ephemeralMessage: msg }],
				},
			};
		}
	}

	return { state, response: {} };
}
