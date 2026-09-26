// see reference docs: docs/harnesses/agy.md
import * as os from "node:os";
import * as path from "node:path";
import { normalizeSkillName } from "../resolver/index.ts";

/** Extracts the skill file path from an Antigravity `<SKILL>` prompt block. */
export const AGY_SKILL_PATH_REGEX =
	/<SKILL>[\s\S]*?The path to the skill file is:\s*([^<]+?)<\/SKILL>/i;

/** Detects cancellation, abort, or interrupt in termination reasons. */
export const TERMINATION_CANCEL_REGEX = /cancel|abort|interrupt/i;

/** Extracts the user prompt wrapped in Antigravity `<USER_REQUEST>` tags. */
export const USER_REQUEST_TAG_REGEX =
	/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i;

import type { HookResponse, ToolCall } from "../types.ts";
import {
	createNormalizedEvent,
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export function stripUserRequest(text: string): string {
	const userRequestMatch = text.match(USER_REQUEST_TAG_REGEX);
	return userRequestMatch ? userRequestMatch[1].trim() : text;
}

export function extractSkillPath(text: string): string | undefined {
	const skillMatch = text.match(AGY_SKILL_PATH_REGEX);
	return skillMatch ? skillMatch[1].trim() : undefined;
}

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

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(
			payload.conversationId ?? env.ANTIGRAVITY_CONVERSATION_ID ?? "default",
		);
		const workspacePaths = Array.isArray(payload.workspacePaths)
			? (payload.workspacePaths as unknown[])
			: undefined;
		const workspacePath = String(
			workspacePaths?.[0] ?? payload.cwd ?? env.PWD ?? ".",
		);

		const terminationReason =
			typeof payload.terminationReason === "string"
				? payload.terminationReason
				: undefined;

		const isTool = modeArg === "tool" || payload.toolCall !== undefined;
		// edge case: AGY stop events omit invocationNum while pre events include it
		const isStop =
			!isTool &&
			(modeArg === "stop" ||
				Boolean(terminationReason && payload.invocationNum === undefined));

		const type: "pre" | "stop" | "tool" = isTool
			? "tool"
			: isStop
				? "stop"
				: "pre";

		const rawPrompt =
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const prompt = rawPrompt ? stripUserRequest(rawPrompt) : undefined;
		const skillInvocationPath =
			(rawPrompt ? extractSkillPath(rawPrompt) : undefined) ??
			(typeof payload.skillInvocationPath === "string"
				? payload.skillInvocationPath
				: undefined);

		const isInterrupted = Boolean(
			terminationReason && TERMINATION_CANCEL_REGEX.test(terminationReason),
		);
		const stopHookActive = Boolean(
			typeof payload.executionNum === "number" && payload.executionNum > 1,
		);

		const toolCall = type === "tool" ? extractToolCall(payload) : null;
		const readTargetFilePath = toolCall
			? (this.extractFileReadTarget?.(toolCall, workspacePath) ?? null)
			: null;
		const skillTarget = toolCall
			? (this.extractSkillTarget?.(toolCall) ?? null)
			: null;

		return createNormalizedEvent({
			harness: "agy",
			conversationId,
			workspacePath,
			type,
			rawPayload: payload,
			stopHookActive,
			toolCall,
			readTargetFilePath,
			skillTarget,
			prompt,
			skillInvocationPath,
			isInterrupted,
			terminationReason,
		});
	},

	extractFileReadTarget(
		toolCall: ToolCall,
		workspacePath: string,
	): string | null {
		if (toolCall.name !== "view_file") return null;
		return resolveToolReadPath(
			toolCall.args.AbsolutePath ?? toolCall.args.path,
			workspacePath,
		);
	},

	extractSkillTarget(toolCall: ToolCall): string | null {
		if (toolCall.name === "Skill") {
			const skill = toolCall.args.skill;
			return typeof skill === "string" ? normalizeSkillName(skill) : null;
		}
		// edge case: AGY can invoke skills via invoke_subagent with skill name in TypeName or Role
		if (toolCall.name === "invoke_subagent") {
			const subagents = toolCall.args.Subagents;
			if (Array.isArray(subagents) && subagents.length > 0) {
				const first = subagents[0] as Record<string, unknown>;
				const target = first.TypeName ?? first.Role;
				return typeof target === "string" ? normalizeSkillName(target) : null;
			}
		}
		return null;
	},

	formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput {
		if (event.type === "stop") {
			if (response.action === "continue") {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						decision: "continue",
						reason: response.reason,
					}),
				};
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({ decision: "allow" }),
			};
		}

		if (event.type === "pre") {
			if (response.action === "inject") {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						injectSteps: [{ ephemeralMessage: response.message }],
					}),
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		if (event.type === "tool") {
			if (response.action === "deny") {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						decision: "deny",
						reason: response.reason,
					}),
				};
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({ decision: "allow" }),
			};
		}

		return { exitCode: 0, stdout: "{}" };
	},

	resolveConversationId(env: NodeJS.ProcessEnv): string | null {
		return env.ANTIGRAVITY_CONVERSATION_ID || null;
	},

	resolveStorageDir(env: NodeJS.ProcessEnv): string | null {
		return env.AGY_PLUGIN_DATA || null;
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
