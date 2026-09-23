// see reference docs: docs/harnesses/codex.md
import * as os from "node:os";
import * as path from "node:path";
import type { HookResponse, ToolCall } from "../types.ts";
import {
	createNormalizedEvent,
	defaultExtractLatestMessage,
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

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

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(
			payload.session_id ?? payload.sessionId ?? "default",
		);
		const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
		const eventName = payload.hook_event_name ?? payload.hookEventName;

		const isTool = modeArg === "tool" || eventName === "PreToolUse";
		const isStop =
			!isTool &&
			(modeArg === "stop" ||
				eventName === "Stop" ||
				payload.stop_hook_active !== undefined ||
				payload.stopHookActive !== undefined);

		const type: "pre" | "stop" | "tool" = isTool
			? "tool"
			: isStop
				? "stop"
				: "pre";

		const prompt =
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const stopHookActive = Boolean(
			payload.stop_hook_active ?? payload.stopHookActive,
		);
		const toolCall = type === "tool" ? extractToolCall(payload) : null;
		const readTargetFilePath = toolCall
			? (this.extractFileReadTarget?.(toolCall, workspacePath) ?? null)
			: null;
		const latestMessage = this.extractLatestMessage({
			type,
			prompt,
			rawPayload: payload,
		});

		return createNormalizedEvent({
			harness: "codex",
			conversationId,
			workspacePath,
			type,
			rawPayload: payload,
			stopHookActive,
			toolCall,
			readTargetFilePath,
			latestMessage,
			prompt,
		});
	},

	extractFileReadTarget(
		toolCall: ToolCall,
		workspacePath: string,
	): string | null {
		const isReadTool =
			toolCall.name === "read_file" ||
			toolCall.name === "view_file" ||
			toolCall.name === "mcp__filesystem__read_file";
		if (!isReadTool) {
			return null;
		}
		return resolveToolReadPath(
			toolCall.args.path ?? toolCall.args.file_path,
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
						suppressOutput: true,
					}),
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		if (event.type === "tool") {
			if (response.decision === "deny") {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						hookSpecificOutput: {
							hookEventName: "PreToolUse",
							permissionDecision: "deny",
							permissionDecisionReason: response.reason,
						},
					}),
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
					: typeof event.rawPayload.hookEventName === "string"
						? event.rawPayload.hookEventName
						: "UserPromptSubmit";
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					systemMessage: "[CURTAIN]",
					hookSpecificOutput: {
						hookEventName,
						additionalContext: text,
					},
					suppressOutput: true,
				}),
			};
		}

		return { exitCode: 0, stdout: JSON.stringify(response) };
	},

	resolveConversationId(env: NodeJS.ProcessEnv): string | null {
		return env.CODEX_SESSION_ID || null;
	},

	resolveStorageDir(env: NodeJS.ProcessEnv): string | null {
		return env.PLUGIN_DATA || null;
	},

	getSkillDirs(
		workspacePath: string,
		env: NodeJS.ProcessEnv = process.env,
	): string[] {
		const home = env.HOME || os.homedir();
		return [
			...getGenericSkillDirs(workspacePath),
			path.join(workspacePath, ".codex/skills"),
			path.join(workspacePath, ".codex/plugins"),
			path.join(home, ".codex/skills"),
			path.join(home, ".codex/plugins/cache"),
			path.join(home, ".codex/plugins/marketplaces"),
		];
	},
};
