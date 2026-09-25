import * as fs from "node:fs";
import * as path from "node:path";
import { formatSkill, parseSkill } from "../lib/parseSkill.ts";
import type { RunnerState } from "../state.ts";
import type { HookInfo, ToolHookResponse } from "../types.ts";
import type { HandlerResult } from "./pre.ts";

function isSameFile(p1: string, p2: string): boolean {
	if (p1 === p2) return true;
	const r1 = path.resolve(p1);
	const r2 = path.resolve(p2);
	if (r1 === r2) return true;
	try {
		return fs.realpathSync(r1) === fs.realpathSync(r2);
	} catch {
		return false;
	}
}

/**
 * Intercepts tool calls before execution (PreToolUse).
 * Hard-blocks file reading tools attempting to inspect the active Curtain script.
 */
export function handlePreTool(
	info: Extract<HookInfo, { type: "tool" }>,
	state: RunnerState | null,
): HandlerResult<ToolHookResponse> {
	if (info.skillTarget) {
		const parsed = parseSkill(info.skillTarget);
		const isCurtainNamespace = parsed?.namespace === "curtain";

		// 1. Strictly block self-advancement at intermissions
		if (isCurtainNamespace && parsed.name === "next") {
			return {
				state,
				response: {
					action: "deny",
					reason:
						"BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
				},
			};
		}

		// 2. If already active, block redundant curtain or active skill re-invocation
		if (state) {
			const activeSkillName = state.skillName?.toLowerCase();
			const isCurtainLauncher = isCurtainNamespace && parsed.name === "curtain";
			const isActiveSkill = Boolean(
				activeSkillName &&
					parsed &&
					(parsed.name === activeSkillName ||
						formatSkill(parsed) === activeSkillName),
			);

			if (isCurtainLauncher || isActiveSkill) {
				return {
					state,
					response: {
						action: "deny",
						reason:
							"BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke Curtain or the active skill via the Skill tool. Execute the active step instructions directly.",
					},
				};
			}
		}

		return { state, response: { action: "allow" } };
	}

	if (!state || !info.readTargetFilePath) {
		return { state, response: { action: "allow" } };
	}

	const scriptPath = path.resolve(info.workspacePath, state.script);
	const isTargetScript = isSameFile(info.readTargetFilePath, scriptPath);

	if (isTargetScript) {
		const targetName = path.basename(state.script);
		return {
			state,
			response: {
				action: "deny",
				reason: `BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect ${targetName}.`,
			},
		};
	}

	return { state, response: { action: "allow" } };
}
