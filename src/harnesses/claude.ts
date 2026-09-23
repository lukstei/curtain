import * as os from "node:os";
import * as path from "node:path";
import type { HookResponse, ToolCall } from "../types.ts";
import {
	defaultExtractLatestMessage,
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export const claudeHarness: HarnessAdapter = {
	id: "claude",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return (
			payload.hook_event_name !== undefined ||
			Boolean(env.CLAUDE_CODE_SESSION_ID)
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
		const toolCall = extractToolCall(payload);
		const readTargetFilePath = toolCall
			? (this.extractFileReadTarget?.(toolCall, workspacePath) ?? null)
			: null;

		const partialEvent: NormalizedEvent = {
			type,
			harness: "claude",
			conversationId,
			workspacePath,
			prompt,
			isStop,
			stopHookActive,
			isInterrupted: false,
			latestMessage: null,
			toolCall,
			readTargetFilePath,
			rawPayload: payload,
		};

		partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
		return partialEvent;
	},

	extractFileReadTarget(
		toolCall: ToolCall,
		workspacePath: string,
	): string | null {
		if (toolCall.name !== "View" && toolCall.name !== "read_file") {
			return null;
		}
		return resolveToolReadPath(
			toolCall.args.file_path ?? toolCall.args.path,
			workspacePath,
		);
	},

	extractLatestMessage: defaultExtractLatestMessage,

	formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput {
		if (event.type === "stop") {
			if (response.decision === "continue" && response.reason) {
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
			if (response.decision === "deny") {
				return {
					exitCode: 2,
					stderr: response.reason ?? "Blocked by Curtain",
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		if (event.type === "pre") {
			const text = response.injectSteps?.[0]?.ephemeralMessage || "";
			if (!text) {
				return { exitCode: 0, stdout: "{}" };
			}
			const hookEventName =
				typeof event.rawPayload.hook_event_name === "string"
					? event.rawPayload.hook_event_name
					: "UserPromptSubmit";
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					hookSpecificOutput: {
						hookEventName,
						additionalContext: text,
					},
				}),
			};
		}

		return { exitCode: 0, stdout: JSON.stringify(response) };
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
