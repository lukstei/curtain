// see reference docs: docs/harnesses/copilot.md
import * as os from "node:os";
import * as path from "node:path";
import { getGenericSkillDirs } from "./common.ts";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.ts";

export const copilotHarness: HarnessAdapter = {
	id: "copilot",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return Boolean(
			env.COPILOT_PLUGIN_DATA ||
				env.COPILOT_SESSION_ID ||
				(payload.timestamp !== undefined &&
					(payload.hook_event_name !== undefined ||
						payload.hookEventName !== undefined)),
		);
	},

	resolveConversationId(
		payload: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
	): string {
		return String(
			payload.sessionId ??
				payload.session_id ??
				payload.conversationId ??
				env.COPILOT_SESSION_ID ??
				"default",
		);
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

	getSkillDirs(workspacePaths: string[]): string[] {
		const home = os.homedir();
		return [
			...getGenericSkillDirs(workspacePaths),
			...workspacePaths.flatMap((wp) => [
				path.join(wp, ".github/skills"),
				path.join(wp, ".claude/skills"),
			]),
			path.join(home, ".copilot/skills"),
			path.join(home, ".claude/skills"),
			path.join(home, ".agents/skills"),
		];
	},
};
