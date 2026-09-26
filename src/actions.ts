import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessType } from "./harnesses/types.ts";
import { assertNever } from "./lib/assertNever.ts";
import { parseCommand } from "./lib/parseCommand.ts";
import {
	formatSkill,
	parseSkill,
	resolveIntentScript,
} from "./resolver/index.ts";
import type { RunnerState } from "./state.ts";
import {
	advanceExecution,
	executeResume,
	executeStart,
	formatIntermissionPrompt,
	formatStepPrompt,
} from "./transitions.ts";

export const TERMINATION_CANCEL_REGEX = /cancel|abort|interrupt/i;

function isSameFile(p1: string, p2: string): boolean {
	if (p1 === p2) return true;
	const r1 = path.resolve(p1);
	const r2 = path.resolve(p2);
	if (r1 === r2) return true;
	try {
		// edge case: symlinks or non-existent target files during path resolution
		return fs.realpathSync(r1) === fs.realpathSync(r2);
	} catch {
		return false;
	}
}

export type AdvanceTurnResult =
	| { readonly action: "continue"; readonly message: string; readonly nextState: RunnerState }
	| { readonly action: "allow"; readonly nextState: RunnerState | null };

export function advanceTurn(params: {
	state: RunnerState | null;
	terminationReason?: string | null;
}): AdvanceTurnResult {
	if (!params.state) {
		return { action: "allow", nextState: null };
	}

	// edge case: stop hook triggered while already waiting for human review at an intermission
	if (params.state.status === "paused") {
		return { action: "allow", nextState: params.state };
	}

	// edge case: user or system aborted or cancelled turn, so do not auto-advance execution
	if (
		params.terminationReason &&
		TERMINATION_CANCEL_REGEX.test(params.terminationReason)
	) {
		return { action: "allow", nextState: params.state };
	}

	const result = advanceExecution(params.state);

	if (result.action === "finish") {
		return { action: "allow", nextState: null };
	}

	if (result.action === "pause") {
		return { action: "allow", nextState: result.state };
	}

	const message = formatStepPrompt(result.step, result.state.steps.length);
	return {
		action: "continue",
		message,
		nextState: result.state,
	};
}

export type UserPromptResult =
	| { readonly action: "start"; readonly message: string; readonly nextState: RunnerState }
	| { readonly action: "resume"; readonly message: string; readonly nextState: RunnerState | null }
	| { readonly action: "intermission_nudge"; readonly message: string; readonly nextState: RunnerState }
	| { readonly action: "error"; readonly message: string; readonly nextState: RunnerState | null }
	| { readonly action: "pass"; readonly nextState: RunnerState | null };


export function resolveUserPrompt(params: {
	prompt: string;
	state: RunnerState | null;
	workspacePath: string;
	harness: HarnessType;
	skillInvocationPath?: string | null;
}): UserPromptResult {
	const intent = parseCommand(
		params.prompt,
		params.skillInvocationPath ?? undefined,
	);

	switch (intent.type) {
		case "next": {
			// edge case: user typed /next without any active or paused playbook execution
			if (!params.state) {
				return {
					action: "error",
					message: "No script is currently loaded.",
					nextState: null,
				};
			}

			const res = executeResume(params.state);
			return {
				action: "resume",
				message: res.message,
				nextState: res.nextState,
			};
		}

		case "skill": {
			// edge case: user invoked a playbook skill command while another playbook is already running
			if (params.state) {
				return { action: "pass", nextState: params.state };
			}

			const resolved = resolveIntentScript(
				intent,
				params.workspacePath,
				params.harness,
			);
			if (resolved.type === "resolved") {
				const res = executeStart(
					resolved.script,
					resolved.skillName ?? intent.skill.name,
				);
				return {
					action: "start",
					message: res.message,
					nextState: res.nextState,
				};
			}
			return { action: "pass", nextState: null };
		}

		case "none":
			break;

		default:
			return assertNever(intent);
	}

	// edge case: user sent regular conversational input during an intermission review instead of /next
	if (params.state?.status === "paused") {
		const currentStep = params.state.steps[params.state.currentStep];
		return {
			action: "intermission_nudge",
			message: formatIntermissionPrompt(currentStep?.instruction),
			nextState: params.state,
		};
	}

	return { action: "pass", nextState: params.state };
}

export type GuardResult =
	| { readonly blocked: true; readonly reason: string }
	| { readonly blocked: false };

export function guardBackstageRead(params: {
	readPath: string | null;
	state: RunnerState | null;
	workspacePath: string;
}): GuardResult {
	if (!params.state || !params.readPath) {
		return { blocked: false };
	}

	// edge case: models attempt to inspect the backstage script file to see downstream steps ahead of time
	if (
		isSameFile(
			params.readPath,
			path.resolve(params.workspacePath, params.state.script),
		)
	) {
		return {
			blocked: true,
			reason: `BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect ${path.basename(params.state.script)}.`,
		};
	}

	return { blocked: false };
}

export function guardSkillInvocation(params: {
	skillTarget: string | null;
	state: RunnerState | null;
}): GuardResult {
	if (!params.skillTarget) {
		return { blocked: false };
	}

	const parsed = parseSkill(params.skillTarget);

	// edge case: models attempt to advance past an intermission by invoking the next skill directly via tools
	if (parsed?.namespace === "curtain" && parsed.name === "next") {
		return {
			blocked: true,
			reason:
				"BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
		};
	}

	// edge case: models attempt to re-invoke the active playbook skill via tools instead of executing the active step directly
	if (params.state?.skillName) {
		const active = params.state.skillName.toLowerCase();
		const target = params.skillTarget.toLowerCase();
		if (
			target === active ||
			(parsed && (parsed.name === active || formatSkill(parsed) === active))
		) {
			return {
				blocked: true,
				reason:
					"BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke the active skill via the Skill tool. Execute the active step instructions directly.",
			};
		}
	}


	return { blocked: false };
}
