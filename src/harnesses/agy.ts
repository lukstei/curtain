// see reference docs: docs/harnesses/agy.md
import * as os from "node:os";
import * as path from "node:path";
import {
	advanceTurn,
	guardBackstageRead,
	resolveSkillInvocation,
} from "../actions.ts";
import { resolveSkillNameFromPath } from "../lib/parseCommand.ts";
import type { RunnerState } from "../state.ts";
import type { HookMode } from "../types.ts";
import { getGenericSkillDirs, resolveToolReadPath } from "./common.ts";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.ts";

type AgyEvent =
	| { kind: "pre" }
	| { kind: "stop"; terminationReason: string | null }
	| {
			kind: "tool";
			toolName: string;
			targetPath: string | null;
			workspacePaths: string[];
	  };

function parseAgyEvent(
	payload: Record<string, unknown>,
	mode: HookMode,
): AgyEvent {
	if (mode === "pre") {
		return { kind: "pre" };
	}

	if (mode === "stop") {
		const terminationReason =
			typeof payload.terminationReason === "string"
				? payload.terminationReason
				: null;
		return { kind: "stop", terminationReason };
	}

	const rawToolCall = payload.toolCall;
	const toolCall =
		rawToolCall && typeof rawToolCall === "object" && "name" in rawToolCall
			? (rawToolCall as { name: string; args?: Record<string, unknown> })
			: null;

	const workspacePaths: string[] = Array.isArray(payload.workspacePaths)
		? (payload.workspacePaths as unknown[]).map(String)
		: [];

	const targetPath =
		typeof toolCall?.args?.AbsolutePath === "string"
			? toolCall.args.AbsolutePath.trim()
			: null;

	return {
		kind: "tool",
		toolName: toolCall?.name ?? "",
		targetPath,
		workspacePaths,
	};
}

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
		const event = parseAgyEvent(payload, ctx.mode);

		switch (event.kind) {
			case "pre":
				// PreInvocation lifecycle: pass through since AGY prompt execution occurs in tool interception
				return agyResult("pass", ctx.state);

			case "stop": {
				if (!ctx.state) {
					return agyResult("allow", null);
				}
				const res = advanceTurn({
					state: ctx.state,
					terminationReason: event.terminationReason,
				});
				if (res.action === "continue") {
					// Stop lifecycle: loop intercept to feed next act instructions and keep agent executing
					return agyResult("continue", res.nextState, res.message);
				}
				// Stop lifecycle: allow turn to conclude when paused for user review, finished, or idle
				return agyResult("allow", res.nextState);
			}

			case "tool": {
				if (event.toolName !== "view_file" || !event.targetPath) {
					// ToolInvocation lifecycle: allow unmonitored tool calls to proceed unimpeded
					return agyResult("allow", ctx.state);
				}

				const targetPath = resolveToolReadPath(
					event.targetPath,
					event.workspacePaths,
				);

				if (ctx.state) {
					const backstage = guardBackstageRead({
						readPath: targetPath,
						state: ctx.state,
						workspacePaths: event.workspacePaths,
					});
					if (backstage.blocked) {
						// ToolInvocation lifecycle: block view_file from reading the active backstage playbook script
						return agyResult("deny", ctx.state, backstage.reason);
					}
				}

				const skillName = resolveSkillNameFromPath(targetPath);
				if (!skillName) {
					// ToolInvocation lifecycle: allow non-skill file reads to proceed normally
					return agyResult("allow", ctx.state);
				}

				const outcome = resolveSkillInvocation({
					skillName,
					skillPath: targetPath,
					state: ctx.state,
					workspacePaths: event.workspacePaths,
					harness: "agy",
				});
				if (
					outcome.action === "start" ||
					outcome.action === "resume" ||
					outcome.action === "block"
				) {
					// ToolInvocation lifecycle: intercept skill execution or block invalid access
					return agyResult("deny", outcome.nextState, outcome.message);
				}
				return agyResult("allow", outcome.nextState);
			}
		}
	},

	getSkillDirs(workspacePaths: string[]): string[] {
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
