import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeSkillName } from "../lib/normalizeSkillName.ts";
import type { RunnerState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import type { HandlerResult } from "./pre.ts";

function isSameFile(p1: string, p2: string): boolean {
	if (p1 === p2) return true;
	try {
		return fs.realpathSync(p1) === fs.realpathSync(p2);
	} catch {
		return path.resolve(p1) === path.resolve(p2);
	}
}

/**
 * Intercepts tool calls before execution (PreToolUse).
 * Hard-blocks file reading tools attempting to inspect the active Curtain script.
 */
export function handlePreTool(
	info: Extract<HookInfo, { type: "tool" }>,
	state: RunnerState | null,
): HandlerResult {
	if (info.skillTarget) {
		const skill = normalizeSkillName(info.skillTarget);

		// 1. Strictly block self-advancement at intermissions
		if (skill === "curtain:next") {
			return {
				state,
				response: {
					decision: "deny",
					reason:
						"BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
				},
			};
		}

		// 2. If already active, block redundant curtain or active skill re-invocation
		if (state) {
			const activeSkillName = path
				.basename(path.dirname(state.script))
				.toLowerCase();
			const isCurtainLauncher =
				skill === "curtain:curtain" ||
				skill === "curtain:start" ||
				skill === "curtain:run";
			const isActiveSkill =
				skill === activeSkillName || skill.endsWith(`:${activeSkillName}`);

			if (isCurtainLauncher || isActiveSkill) {
				return {
					state,
					response: {
						decision: "deny",
						reason:
							"BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke Curtain or the active skill via the Skill tool. Execute the active step instructions directly.",
					},
				};
			}
		}

		return { state, response: { decision: "allow" } };
	}

	if (!state || !info.readTargetFilePath) {
		return { state, response: { decision: "allow" } };
	}

	const scriptPath = path.resolve(info.workspacePath, state.script);
	const isPlaybook =
		path.basename(info.readTargetFilePath).toUpperCase() === "PLAYBOOK.MD" ||
		isSameFile(info.readTargetFilePath, scriptPath);

	if (isPlaybook) {
		return {
			state,
			response: {
				decision: "deny",
				reason:
					"BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect PLAYBOOK.md.",
			},
		};
	}

	return { state, response: { decision: "allow" } };
}
