import { resolveToolReadPath } from "../harnesses/common.ts";
import type { HarnessType } from "../harnesses/types.ts";
import { assertNever } from "../lib/assertNever.ts";
import { parseCommand } from "../lib/parseCommand.ts";
import {
	hasCurtainAnnotations,
	resolvePlaybookPath,
	resolveSkillPath,
} from "../lib/resolveSkill.ts";
import type { Script } from "../parser.ts";
import { loadScript } from "../resolver.ts";
import type { RunnerState } from "../state.ts";
import {
	formatIntermissionPrompt,
	formatStepPrompt,
	resumeExecution,
	startExecution,
} from "../transitions.ts";
import type { HookInfo, PreHookResponse } from "../types.ts";

export interface HandlerResult<T = PreHookResponse> {
	state: RunnerState | null;
	response: T;
}

function startScript(
	script: Script,
	skillName?: string,
): HandlerResult<PreHookResponse> {
	const nextState = startExecution(script, skillName);
	const firstStep = nextState.steps[0];
	const msg = formatStepPrompt(firstStep, nextState.steps.length);
	return {
		state: nextState,
		response: { action: "inject", message: msg },
	};
}

export function handlePre(
	info: Extract<HookInfo, { type: "pre" }>,
	state: RunnerState | null,
): HandlerResult<PreHookResponse> {
	const intent = parseCommand(info.prompt, info.skillInvocationPath);

	switch (intent.type) {
		case "error":
			return {
				state,
				response: { action: "inject", message: intent.error },
			};

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

			const res = resumeExecution(state);
			if (res.action === "error") {
				return {
					state,
					response: {
						action: "inject",
						message: res.error,
					},
				};
			}

			if (res.action === "finish") {
				return {
					state: null,
					response: {
						action: "inject",
						message: "Execution complete.",
					},
				};
			}

			const msg = formatStepPrompt(res.step, res.state.steps.length);
			return {
				state: res.state,
				response: { action: "inject", message: msg },
			};
		}

		case "run": {
			const loaded = loadScript(intent.path, [info.workspacePath]);
			if (!loaded || "error" in loaded) {
				const err = !loaded
					? `Script file not found: "${intent.path}"`
					: loaded.error;
				return {
					state,
					response: { action: "inject", message: err },
				};
			}
			return startScript(loaded.script);
		}

		case "skill": {
			if (!state) {
				let targetSkillPath: string | null = null;
				if (intent.targetPath) {
					targetSkillPath = resolveToolReadPath(
						intent.targetPath,
						info.workspacePath,
					);
				} else if (intent.skill) {
					const harness = info.harness as HarnessType | undefined;
					targetSkillPath = resolveSkillPath(
						intent.skill.name,
						harness,
						info.workspacePath,
					);
				}

				if (targetSkillPath) {
					const playbookPath = resolvePlaybookPath(
						targetSkillPath,
						info.harness as HarnessType | undefined,
						info.workspacePath,
					);
					if (playbookPath && hasCurtainAnnotations(playbookPath)) {
						const loaded = loadScript(playbookPath, [info.workspacePath]);
						if (
							loaded &&
							!("error" in loaded) &&
							loaded.script.steps.length > 1
						) {
							return startScript(loaded.script, intent.skill?.name);
						}
					}
				}
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
		const msg = formatIntermissionPrompt(currentStep?.instruction);
		return {
			state,
			response: {
				action: "inject",
				message: msg,
			},
		};
	}

	return { state, response: { action: "pass" } };
}
