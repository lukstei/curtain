import * as fs from "node:fs";
import * as path from "node:path";
import { formatSkill, parseSkill } from "../resolver/index.ts";
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
	const allow: HandlerResult<ToolHookResponse> = {
		state,
		response: { action: "allow" },
	};
	const deny = (reason: string): HandlerResult<ToolHookResponse> => ({
		state,
		response: { action: "deny", reason },
	});

	if (info.skillTarget) {
		const parsed = parseSkill(info.skillTarget);
		const isCurtain = parsed?.namespace === "curtain";

		// Block self-advancement at intermissions
		if (isCurtain && parsed.name === "next") {
			return deny(
				"BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
			);
		}

		// Block redundant curtain or active skill re-invocation
		if (state) {
			const active = state.skillName?.toLowerCase();
			if (
				(isCurtain && parsed.name === "curtain") ||
				(active &&
					parsed &&
					(parsed.name === active || formatSkill(parsed) === active))
			) {
				return deny(
					"BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke Curtain or the active skill via the Skill tool. Execute the active step instructions directly.",
				);
			}
		}

		return allow;
	}

	// Block reading the active playbook script
	if (
		state &&
		info.readTargetFilePath &&
		isSameFile(
			info.readTargetFilePath,
			path.resolve(info.workspacePath, state.script),
		)
	) {
		return deny(
			`BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect ${path.basename(state.script)}.`,
		);
	}

	return allow;
}
