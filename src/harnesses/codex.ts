// see reference docs: docs/harnesses/codex.md
import * as os from "node:os";
import * as path from "node:path";
import { getGenericSkillDirs } from "./common.ts";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.ts";

export const codexHarness: HarnessAdapter = {
	id: "codex",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return Boolean(
			env.CODEX_SESSION_ID ||
				env.PLUGIN_DATA ||
				payload.turn_id !== undefined ||
				payload.hookEventName !== undefined,
		);
	},

	resolveConversationId(
		payload: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
	): string {
		return String(
			payload.session_id ??
				payload.sessionId ??
				env.CODEX_SESSION_ID ??
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

	getSkillDirs(workspacePaths: readonly string[]): string[] {
		const home = os.homedir();
		return [
			...getGenericSkillDirs(workspacePaths),
			...workspacePaths.flatMap((wp) => [
				path.join(wp, ".codex/skills"),
				path.join(wp, ".codex/plugins"),
			]),
			path.join(home, ".codex/skills"),
			path.join(home, ".codex/plugins/cache"),
			path.join(home, ".codex/plugins/marketplaces"),
		];
	},
};
