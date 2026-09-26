// see reference docs: docs/harnesses/claude.md
import * as os from "node:os";
import * as path from "node:path";
import { getGenericSkillDirs } from "./common.ts";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.ts";

export const claudeHarness: HarnessAdapter = {
	id: "claude",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		if (env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_PLUGIN_DATA) return true;
		// edge case: Claude Code payloads share hook_event_name with Codex and Copilot but omit turn_id and timestamp
		return (
			payload.hook_event_name !== undefined &&
			payload.turn_id === undefined &&
			payload.timestamp === undefined
		);
	},

	resolveConversationId(
		payload: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
	): string {
		return String(payload.session_id ?? env.CLAUDE_CODE_SESSION_ID ?? "default");
	},

	handle(
		_payload: Record<string, unknown>,
		ctx: HarnessContext,
	): HarnessResult {
		return {
			egress: { exitCode: 0, stdout: "{}" },
			nextState: ctx.state,
		};
	},

	getSkillDirs(
		workspacePath: string,
		env: NodeJS.ProcessEnv = process.env,
	): string[] {
		const home = env.HOME || os.homedir();
		const dirs = [
			...getGenericSkillDirs(workspacePath),
			path.join(workspacePath, ".claude/skills"),
			path.join(workspacePath, ".claude/plugins"),
			path.join(home, ".claude/skills"),
			path.join(home, ".claude/plugins/marketplaces"),
			path.join(home, ".claude/plugins/cache"),
		];
		if (env.CLAUDE_PLUGIN_ROOT) {
			dirs.push(path.join(env.CLAUDE_PLUGIN_ROOT, "skills"));
		}
		return dirs;
	},
};
