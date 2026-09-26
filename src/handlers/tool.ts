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
		// edge case: symlinks or non-existent target files during path resolution
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

		// edge case: models attempt to advance past an intermission by invoking the next skill directly via tools
		if (parsed?.namespace === "curtain" && parsed.name === "next") {
			return deny(
				"BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
			);
		}

		// edge case: models attempt to re-invoke the active playbook skill via tools instead of executing the active step directly
		if (state?.skillName && parsed) {
			const active = state.skillName.toLowerCase();
			if (parsed.name === active || formatSkill(parsed) === active) {
				return deny(
					"BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke the active skill via the Skill tool. Execute the active step instructions directly.",
				);
			}
		}

		return allow;
	}

	// edge case: models attempt to inspect the backstage script file to see downstream steps ahead of time
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
