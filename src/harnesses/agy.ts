// see reference docs: docs/harnesses/agy.md
import * as os from "node:os";
import * as path from "node:path";
import {
	advanceTurn,
	guardBackstageRead,
	resumePlaybook,
	startPlaybook,
} from "../actions.ts";
import { resolveSkillNameFromPath } from "../lib/parseCommand.ts";
import { loadSkillScript } from "../resolver/index.ts";
import type { RunnerState } from "../state.ts";
import {
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.ts";

function agyResult(
	decision: "allow" | "deny" | "continue" | "pass",
	nextState: RunnerState | null,
	reason?: string,
): HarnessResult {
	const stdout =
		decision === "pass"
			? "{}"
			: JSON.stringify({ decision, ...(reason && { reason }) });
	return { egress: { exitCode: 0, stdout }, nextState };
}

export const agyHarness: HarnessAdapter = {
	id: "agy",

	detect(_payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return Boolean(
			env.AGY_HOOK_ACTIVE ||
				env.ANTIGRAVITY_CONVERSATION_ID ||
				env.GEMINI_CLI === "1" ||
				env.ANTIGRAVITY === "1",
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

	handle(payload: Record<string, unknown>, ctx: HarnessContext): HarnessResult {
		if (ctx.mode === "pre") {
			// PreInvocation lifecycle: pass through since AGY prompt execution occurs in tool interception
			return agyResult("pass", ctx.state);
		}

		if (ctx.mode === "stop") {
			const terminationReason =
				typeof payload.terminationReason === "string"
					? payload.terminationReason
					: null;
			const res = advanceTurn({ state: ctx.state, terminationReason });
			if (res.action === "continue") {
				// Stop lifecycle: loop intercept to feed next act instructions and keep agent executing
				return agyResult("continue", res.nextState, res.message);
			}
			// Stop lifecycle: allow turn to conclude when paused for user review, finished, or idle
			return agyResult("allow", res.nextState);
		}

		if (ctx.mode === "tool") {
			const toolCall = extractToolCall(payload);
			if (toolCall?.name !== "view_file") {
				// ToolInvocation lifecycle: allow unmonitored tool calls to proceed unimpeded
				return agyResult("allow", ctx.state);
			}

			const workspacePaths: readonly string[] =
				Array.isArray(payload.workspacePaths) &&
				payload.workspacePaths.length > 0
					? (payload.workspacePaths as unknown[]).map(String)
					: [String(payload.cwd ?? ctx.env.PWD ?? ".")];

			const targetPath = resolveToolReadPath(
				toolCall.args.AbsolutePath ?? toolCall.args.path,
				workspacePaths,
			);

			const backstage = guardBackstageRead({
				readPath: targetPath,
				state: ctx.state,
				workspacePaths,
			});
			if (backstage.blocked) {
				// ToolInvocation lifecycle: block view_file from reading the active backstage playbook script
				return agyResult("deny", ctx.state, backstage.reason);
			}

			const skillName = resolveSkillNameFromPath(targetPath);
			if (!skillName) {
				// ToolInvocation lifecycle: allow non-skill file reads to proceed normally
				return agyResult("allow", ctx.state);
			}

			if (skillName === "next") {
				const res = resumePlaybook(ctx.state);
				// ToolInvocation lifecycle: intercept next/SKILL.md read at an intermission to resume playbook execution
				return agyResult("deny", res.nextState, res.message);
			}

			if (ctx.state) {
				// edge case: prevent model from re-invoking or reading the active skill definition during an ongoing run
				if (ctx.state.skillName?.toLowerCase() === skillName.toLowerCase()) {
					return agyResult(
						"deny",
						ctx.state,
						"BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke the active skill via the Skill tool. Execute the active step instructions directly.",
					);
				}
				return agyResult("allow", ctx.state);
			}

			const script = loadSkillScript(
				{ name: skillName, path: targetPath },
				workspacePaths,
				"agy",
			);
			if (script) {
				const res = startPlaybook(script, skillName, ctx.state);
				if (res.action === "started") {
					// ToolInvocation lifecycle: intercept entry-point skill SKILL.md read when idle to start the playbook
					return agyResult("deny", res.nextState, res.message);
				}
			}

			return agyResult("allow", ctx.state);
		}

		return agyResult("pass", ctx.state);
	},

	getSkillDirs(workspacePaths: readonly string[]): string[] {
		const home = os.homedir();
		return [
			...getGenericSkillDirs(workspacePaths),
			...workspacePaths.map((wp) => path.join(wp, ".agents/plugins")),
			path.join(home, ".gemini/config/skills"),
			path.join(home, ".gemini/config/plugins"),
			path.join(home, ".gemini/antigravity/builtin/skills"),
		];
	},
};
