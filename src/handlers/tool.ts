import * as fs from "node:fs";
import * as path from "node:path";
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
	if (!state || !info.readTargetFilePath) {
		return { state, response: { decision: "allow" } };
	}

	const scriptPath = path.resolve(info.workspacePath, state.script);

	if (isSameFile(info.readTargetFilePath, scriptPath)) {
		return {
			state,
			response: {
				decision: "deny",
				reason:
					"BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect the raw skill file.",
			},
		};
	}

	return { state, response: { decision: "allow" } };
}
