// see reference docs: docs/harnesses/claude.md
import * as os from "node:os";
import * as path from "node:path";
import { normalizeSkillName } from "../lib/normalizeSkillName.ts";
import type { HookResponse, ToolCall } from "../types.ts";
import {
	createNormalizedEvent,
	defaultExtractLatestMessage,
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export const claudeHarness: HarnessAdapter = {
	id: "claude",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		if (env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_PLUGIN_DATA) return true;
		return (
			payload.hook_event_name !== undefined &&
			payload.turn_id === undefined &&
			payload.timestamp === undefined
		);
	},

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(payload.session_id ?? "default");
		const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
		const eventName = payload.hook_event_name;

		const isTool = modeArg === "tool" || eventName === "PreToolUse";
		const isStop =
			!isTool &&
			(modeArg === "stop" ||
				eventName === "Stop" ||
				payload.stop_hook_active !== undefined);

		const type: "pre" | "stop" | "tool" = isTool
			? "tool"
			: isStop
				? "stop"
				: "pre";

		const prompt =
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const stopHookActive = Boolean(payload.stop_hook_active);
		const toolCall = type === "tool" ? extractToolCall(payload) : null;
		const readTargetFilePath = toolCall
			? (this.extractFileReadTarget?.(toolCall, workspacePath) ?? null)
			: null;
		const skillTarget = toolCall
			? (this.extractSkillTarget?.(toolCall) ?? null)
			: null;
		const latestMessage = this.extractLatestMessage({
			type,
			prompt,
			rawPayload: payload,
		});

		return createNormalizedEvent({
			harness: "claude",
			conversationId,
			workspacePath,
			type,
			rawPayload: payload,
			stopHookActive,
			toolCall,
			readTargetFilePath,
			skillTarget,
			latestMessage,
			prompt,
		});
	},

	extractFileReadTarget(
		toolCall: ToolCall,
		workspacePath: string,
	): string | null {
		const isReadTool =
			toolCall.name === "Read" ||
			toolCall.name === "View" ||
			toolCall.name === "read_file" ||
			toolCall.name === "mcp__filesystem__read_file";
		if (!isReadTool) {
			return null;
		}
		return resolveToolReadPath(
			toolCall.args.file_path ?? toolCall.args.path,
			workspacePath,
		);
	},

	extractSkillTarget(toolCall: ToolCall): string | null {
		if (toolCall.name !== "Skill") {
			return null;
		}
		const skill = toolCall.args.skill;
		return typeof skill === "string" ? normalizeSkillName(skill) : null;
	},

	extractLatestMessage: defaultExtractLatestMessage,

	formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput {
		if (event.type === "stop") {
			if (response.action === "continue") {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						decision: "block",
						reason: response.reason,
					}),
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		if (event.type === "tool") {
			if (response.action === "deny") {
				return {
					exitCode: 2,
					stderr: response.reason,
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		if (event.type === "pre") {
			if (response.action === "inject") {
				const hookEventName =
					typeof event.rawPayload.hook_event_name === "string"
						? event.rawPayload.hook_event_name
						: "UserPromptSubmit";
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						hookSpecificOutput: {
							hookEventName,
							additionalContext: response.message,
						},
					}),
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		return { exitCode: 0, stdout: "{}" };
	},

	resolveConversationId(env: NodeJS.ProcessEnv): string | null {
		return env.CLAUDE_CODE_SESSION_ID || null;
	},

	resolveStorageDir(env: NodeJS.ProcessEnv): string | null {
		return env.CLAUDE_PLUGIN_DATA || null;
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
