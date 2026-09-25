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
	executeResume,
	executeStart,
	formatIntermissionPrompt,
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
	const res = executeStart(script, skillName);
	return {
		state: res.nextState,
		response: { action: "inject", message: res.message },
	};
}

export function handlePre(
	info: Extract<HookInfo, { type: "pre" }>,
	state: RunnerState | null,
): HandlerResult<PreHookResponse> {
	const intent = parseCommand(info.prompt, info.skillInvocationPath);

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
			const loaded = loadScript(intent.path, [info.workspacePath]);
			if (!loaded || "error" in loaded) {
				const msg = !loaded
					? `Script file not found: "${intent.path}"`
					: loaded.error;
				return { state, response: { action: "inject", message: msg } };
			}
			return startScript(loaded.script);
		}

		case "skill": {
			if (state) break;

			const targetSkillPath = intent.targetPath
				? resolveToolReadPath(intent.targetPath, info.workspacePath)
				: intent.skill
					? resolveSkillPath(
							intent.skill.name,
							info.harness as HarnessType | undefined,
							info.workspacePath,
						)
					: null;

			if (!targetSkillPath) break;

			const harness = info.harness as HarnessType | undefined;
			const playbookPath = resolvePlaybookPath(
				targetSkillPath,
				harness,
				info.workspacePath,
			);
			if (!playbookPath || !hasCurtainAnnotations(playbookPath)) break;

			const loaded = loadScript(playbookPath, [info.workspacePath]);
			if (loaded && !("error" in loaded) && loaded.script.steps.length > 1) {
				return startScript(loaded.script, intent.skill?.name);
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
