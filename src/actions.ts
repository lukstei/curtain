import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessType } from "./harnesses/types.ts";
import { assertNever } from "./lib/assertNever.ts";
import { parseCommand } from "./lib/parseCommand.ts";
import type { Script } from "./parser/index.ts";
import {
	formatSkill,
	loadSkillScript,
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
	| {
			action: "continue";
			message: string;
			nextState: RunnerState;
	  }
	| { action: "allow"; nextState: RunnerState | null };

export function advanceTurn(params: {
	state: RunnerState;
	terminationReason: string | null;
}): AdvanceTurnResult {
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

export type ResumePlaybookResult =
	| {
			action: "resumed";
			message: string;
			nextState: RunnerState | null;
	  }
	| {
			action: "error";
			message: string;
			nextState: RunnerState;
	  };

export function resumePlaybook(state: RunnerState): ResumePlaybookResult {
	if (state.status !== "paused") {
		return {
			action: "error",
			message:
				"BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
			nextState: state,
		};
	}

	const res = executeResume(state);
	if (res.action === "error") {
		return {
			action: "error",
			message: res.message,
			nextState: res.nextState,
		};
	}

	return {
		action: "resumed",
		message: res.message,
		nextState: res.nextState,
	};
}

export type StartPlaybookResult = {
	action: "started";
	message: string;
	nextState: RunnerState;
};

export function startPlaybook(
	script: Script,
	skillName: string,
): StartPlaybookResult {
	const res = executeStart(script, skillName);
	return {
		action: "started",
		message: res.message,
		nextState: res.nextState,
	};
}

export type UserPromptResult =
	| {
			action: "start";
			message: string;
			nextState: RunnerState;
	  }
	| {
			action: "resume";
			message: string;
			nextState: RunnerState | null;
	  }
	| {
			action: "intermission_nudge";
			message: string;
			nextState: RunnerState;
	  }
	| {
			action: "error";
			message: string;
			nextState: RunnerState | null;
	  }
	| { action: "pass"; nextState: RunnerState | null };

export function resolveUserPrompt(params: {
	prompt: string;
	state: RunnerState | null;
	workspacePaths: string[];
	harness: HarnessType;
	skillInvocationPath?: string;
}): UserPromptResult {
	const intent = parseCommand(params.prompt, params.skillInvocationPath);

	switch (intent.type) {
		case "next": {
			if (!params.state) {
				return {
					action: "error",
					message: "BLOCKED BY CURTAIN: No script is currently loaded.",
					nextState: null,
				};
			}
			const res = resumePlaybook(params.state);
			if (res.action === "error") {
				return {
					action: "error",
					message: res.message,
					nextState: res.nextState,
				};
			}
			return {
				action: "resume",
				message: res.message,
				nextState: res.nextState,
			};
		}

		case "skill": {
			if (params.state) {
				return { action: "pass", nextState: params.state };
			}

			const resolved = resolveIntentScript(
				intent,
				params.workspacePaths,
				params.harness,
			);
			if (resolved.type === "resolved") {
				const res = startPlaybook(
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
	| { blocked: true; reason: string }
	| { blocked: false };

export function guardBackstageRead(params: {
	readPath: string;
	state: RunnerState;
	workspacePaths: string[];
}): GuardResult {
	assert(params.readPath.length > 0, "readPath must not be empty");

	const script = params.state.script;
	if (path.isAbsolute(script)) {
		if (isSameFile(params.readPath, script)) {
			return {
				blocked: true,
				reason: `BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect ${path.basename(script)}.`,
			};
		}
	}

	for (const wp of params.workspacePaths) {
		// edge case: models attempt to inspect the backstage script file to see downstream steps ahead of time
		if (isSameFile(params.readPath, path.resolve(wp, script))) {
			return {
				blocked: true,
				reason: `BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect ${path.basename(script)}.`,
			};
		}
	}

	return { blocked: false };
}

export function guardSkillInvocation(params: {
	skillTarget: string;
	state: RunnerState;
}): GuardResult {
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
	if (params.state.skillName) {
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

export type SkillInvocationResult =
	| {
			readonly action: "start";
			readonly message: string;
			readonly nextState: RunnerState;
	  }
	| {
			readonly action: "resume";
			readonly message: string;
			readonly nextState: RunnerState | null;
	  }
	| {
			readonly action: "block";
			readonly message: string;
			readonly nextState: RunnerState | null;
	  }
	| { readonly action: "pass"; readonly nextState: RunnerState | null };

export function resolveSkillInvocation(params: {
	skillName: string;
	state: RunnerState | null;
	workspacePaths: string[];
	harness: HarnessType;
	skillPath?: string;
}): SkillInvocationResult {
	if (params.skillName === "next") {
		if (!params.state) {
			return {
				action: "block",
				message: "BLOCKED BY CURTAIN: No script is currently loaded.",
				nextState: null,
			};
		}
		const res = resumePlaybook(params.state);
		if (res.action === "error") {
			return {
				action: "block",
				message: res.message,
				nextState: res.nextState,
			};
		}
		return {
			action: "resume",
			message: res.message,
			nextState: res.nextState,
		};
	}

	if (params.state) {
		const guard = guardSkillInvocation({
			skillTarget: params.skillName,
			state: params.state,
		});
		if (guard.blocked) {
			return {
				action: "block",
				message: guard.reason,
				nextState: params.state,
			};
		}
		return { action: "pass", nextState: params.state };
	}

	const script = loadSkillScript(
		{ name: params.skillName, path: params.skillPath },
		params.workspacePaths,
		params.harness,
	);
	if (script) {
		const res = startPlaybook(script, params.skillName);
		return {
			action: "start",
			message: res.message,
			nextState: res.nextState,
		};
	}

	return { action: "pass", nextState: null };
}
