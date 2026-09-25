// see reference docs: docs/harnesses/codex.md
import * as os from "node:os";
import * as path from "node:path";
import { getLatestMessage } from "../lib/getLatestMessage.ts";
import {
	ANGLE_BRACKET_ENCLOSURE_REGEX,
	SKILL_LINK_PATH_CAPTURE_REGEX,
	XML_SKILL_PATH_REGEX,
} from "../regex.ts";
import type { HookResponse, LatestMessage, ToolCall } from "../types.ts";
import {
	createNormalizedEvent,
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export function extractCodexSkillPath(
	text: string,
	workspacePath: string,
): string | undefined {
	const linkMatch = text.match(SKILL_LINK_PATH_CAPTURE_REGEX);
	if (linkMatch?.[2]) {
		const raw = linkMatch[2].replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "").trim();
		return resolveToolReadPath(raw, workspacePath) ?? undefined;
	}
	const xmlMatch = text.match(XML_SKILL_PATH_REGEX);
	if (xmlMatch?.[1]) {
		const raw = xmlMatch[1].replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "").trim();
		return resolveToolReadPath(raw, workspacePath) ?? undefined;
	}
	return undefined;
}

export function parseCodexMessage(
	item: Record<string, unknown>,
): LatestMessage | null {
	if (
		item.type === "response_item" &&
		item.payload &&
		typeof item.payload === "object"
	) {
		const payload = item.payload as Record<string, unknown>;
		if (payload.type === "message") {
			const content = Array.isArray(payload.content) ? payload.content : [];
			const text = content
				.map((c) => (c as { text?: string }).text ?? "")
				.filter(Boolean)
				.join("\n")
				.trim();
			if (!text) return null;

			if (payload.role === "assistant") {
				return { type: "PLANNER_RESPONSE", content: text };
			}
			if (payload.role === "user") {
				return { type: "USER_INPUT", content: text };
			}
		}
	}
	return null;
}

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
		const skillInvocationPath = prompt
			? extractCodexSkillPath(prompt, workspacePath)
			: undefined;

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
			skillInvocationPath,
		});
	},

	extractFileReadTarget(
		toolCall: ToolCall,
		workspacePath: string,
	): string | null {
		const isReadTool =
			toolCall.name === "read_file" ||
			toolCall.name === "view_file" ||
			toolCall.name === "Read" ||
			toolCall.name === "View" ||
			toolCall.name === "mcp__filesystem__read_file" ||
			toolCall.name.endsWith("__read_file") ||
			toolCall.name.endsWith("__view_file");
		if (!isReadTool) {
			return null;
		}
		return resolveToolReadPath(
			toolCall.args.path ??
				toolCall.args.file_path ??
				toolCall.args.filePath ??
				toolCall.args.AbsolutePath,
			workspacePath,
		);
	},

	extractLatestMessage(event: {
		type: "pre" | "stop" | "tool";
		prompt?: string;
		rawPayload: Record<string, unknown>;
	}): LatestMessage | null {
		if (event.type === "stop") {
			const raw =
				event.rawPayload.last_assistant_message ??
				event.rawPayload.lastAssistantMessage;
			if (typeof raw === "string" && raw.length > 0) {
				return {
					type: "PLANNER_RESPONSE",
					content: raw,
				};
			}
			const transcript =
				event.rawPayload.transcript_path ?? event.rawPayload.transcriptPath;
			if (typeof transcript === "string") {
				return getLatestMessage(transcript, parseCodexMessage);
			}
			return null;
		}

		if (event.prompt) {
			return {
				type: "USER_INPUT",
				content: event.prompt,
			};
		}

		return null;
	},

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
