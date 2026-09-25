import type { HarnessType } from "../harnesses/types.ts";
import { assertNever } from "../lib/assertNever.ts";
import { parseCommand } from "../lib/parseCommand.ts";
import type { Script } from "../parser/index.ts";
import { loadScript, loadSkillScript } from "../resolver/index.ts";
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

			const target = intent.targetPath ?? intent.skill?.name;
			const script = loadSkillScript(
				target,
				info.workspacePath,
				info.harness as HarnessType | undefined,
			);
			if (script) {
				return startScript(script, intent.skill?.name);
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
