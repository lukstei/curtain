import { resolveToolReadPath } from "../harnesses/common.ts";
import type { HarnessType } from "../harnesses/types.ts";
import { parseCommand } from "../lib/parseCommand.ts";
import {
	hasCurtainAnnotations,
	resolvePlaybookPath,
	resolveSkillPath,
} from "../lib/resolveSkill.ts";
import type { Script } from "../parser.ts";
import {
	ANGLE_BRACKET_ENCLOSURE_REGEX,
	BARE_SKILL_COMMAND_REGEX,
	SKILL_LINK_WITH_OPTIONAL_PATH_REGEX,
} from "../regex.ts";
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

function startScript(script: Script): HandlerResult<PreHookResponse> {
	const nextState = startExecution(script);
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
	const userInput = info.prompt;

	const parsed = parseCommand(userInput, info.skillInvocationPath);
	if (parsed.isCurtainCommand) {
		if (parsed.error) {
			return {
				state,
				response: { action: "inject", message: parsed.error },
			};
		}

		if (parsed.command?.name === "next") {
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

		if (parsed.command?.name === "run") {
			const loaded = loadScript(parsed.command.path, [info.workspacePath]);
			if (!loaded || "error" in loaded) {
				const err = !loaded
					? `Script file not found: "${parsed.command.path}"`
					: loaded.error;
				return {
					state,
					response: { action: "inject", message: err },
				};
			}
			return startScript(loaded.script);
		}
	}

	if (!state) {
		let targetSkillPath: string | null = info.skillInvocationPath ?? null;
		if (!targetSkillPath && userInput) {
			const trimmed = userInput.trim();
			const linkMatch = trimmed.match(SKILL_LINK_WITH_OPTIONAL_PATH_REGEX);
			if (linkMatch?.[2]) {
				const raw = linkMatch[2]
					.replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "")
					.trim();
				targetSkillPath = resolveToolReadPath(raw, info.workspacePath);
			} else {
				const bareCommand = trimmed.match(BARE_SKILL_COMMAND_REGEX);
				const skillName = linkMatch?.[1] ?? bareCommand?.[1];
				if (skillName) {
					const harness = info.harness as HarnessType | undefined;
					targetSkillPath = resolveSkillPath(
						skillName,
						harness,
						info.workspacePath,
					);
				}
			}
		}
		if (targetSkillPath) {
			const playbookPath = resolvePlaybookPath(
				targetSkillPath,
				info.harness as HarnessType | undefined,
				info.workspacePath,
			);
			if (playbookPath && hasCurtainAnnotations(playbookPath)) {
				const loaded = loadScript(playbookPath, [info.workspacePath]);
				if (loaded && !("error" in loaded) && loaded.script.steps.length > 1) {
					return startScript(loaded.script);
				}
			}
		}
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
