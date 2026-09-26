// see reference docs: docs/harnesses/agy.md
import * as os from "node:os";
import * as path from "node:path";
import { getGenericSkillDirs } from "./common.ts";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.ts";

export const agyHarness: HarnessAdapter = {
	id: "agy",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		if (
			env.AGY_HOOK_ACTIVE ||
			env.ANTIGRAVITY_CONVERSATION_ID ||
			env.GEMINI_CLI === "1" ||
			env.ANTIGRAVITY === "1"
		) {
			return true;
		}
		if (payload.artifactDirectoryPath !== undefined) {
			return true;
		}
		return (
			typeof payload.transcriptPath === "string" &&
			payload.transcriptPath.endsWith(".system_generated/logs/transcript.jsonl")
		);
	},

	resolveConversationId(
		payload: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
	): string {
		return String(
			payload.conversationId ?? env.ANTIGRAVITY_CONVERSATION_ID ?? "default",
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

	getSkillDirs(
		workspacePath: string,
		env: NodeJS.ProcessEnv = process.env,
	): string[] {
		const home = env.HOME || os.homedir();
		return [
			...getGenericSkillDirs(workspacePath),
			path.join(workspacePath, ".agents/plugins"),
			path.join(home, ".gemini/config/skills"),
			path.join(home, ".gemini/config/plugins"),
			path.join(home, ".gemini/antigravity/builtin/skills"),
		];
	},
};
