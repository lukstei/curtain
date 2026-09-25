import assert from "node:assert/strict";
import * as path from "node:path";
import { getLatestMessage } from "../lib/getLatestMessage.ts";
import type { HookType, LatestMessage, ToolCall } from "../types.ts";
import type { HarnessType, NormalizedEvent } from "./types.ts";

export function parseClaudeMessage(
	item: Record<string, unknown>,
): LatestMessage | null {
	if (
		item.role === "assistant" ||
		(item.message as Record<string, unknown>)?.role === "assistant"
	) {
		const msg = (item.message ?? item) as {
			content?: Array<{ type?: string; text?: string }>;
		};
		if (Array.isArray(msg.content)) {
			const textBlock = msg.content.find((c) => c.type === "text");
			if (typeof textBlock?.text === "string") {
				return {
					type: "PLANNER_RESPONSE",
					content: textBlock.text,
				};
			}
		}
	}

	if (item.role === "user" && typeof item.content === "string") {
		return {
			type: "USER_INPUT",
			content: item.content,
		};
	}

	return null;
}

/**
 * Shared stop/pre message extraction for claude, codex and copilot,
 * which share the same transcript and payload field conventions.
 */
export function defaultExtractLatestMessage(event: {
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
			return getLatestMessage(transcript, parseClaudeMessage);
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
}

export function getGenericSkillDirs(workspacePath: string): string[] {
	return [
		path.join(workspacePath, ".agents/skills"),
		path.join(workspacePath, "skills"),
	];
}

export function extractToolCall(
	payload: Record<string, unknown>,
): ToolCall | null {
	if (
		payload.toolCall &&
		typeof payload.toolCall === "object" &&
		"name" in (payload.toolCall as object)
	) {
		const tc = payload.toolCall as {
			name: string;
			args?: Record<string, unknown>;
		};
		return { name: tc.name, args: tc.args ?? {} };
	}

	const toolName =
		typeof payload.tool_name === "string"
			? payload.tool_name
			: typeof payload.toolName === "string"
				? payload.toolName
				: undefined;

	if (toolName) {
		const rawArgs =
			payload.tool_input ??
			payload.toolInput ??
			payload.args ??
			payload.arguments;
		const args =
			typeof rawArgs === "object" && rawArgs !== null
				? (rawArgs as Record<string, unknown>)
				: {};
		return { name: toolName, args };
	}

	return null;
}

export function resolveToolReadPath(
	rawPath: unknown,
	workspacePath: string,
): string | null {
	if (typeof rawPath !== "string" || !rawPath.trim()) return null;
	const target = rawPath.trim();
	return path.isAbsolute(target) ? target : path.resolve(workspacePath, target);
}

export function createNormalizedEvent(params: {
	harness: HarnessType;
	conversationId: string;
	workspacePath: string;
	type: HookType;
	rawPayload: Record<string, unknown>;
	stopHookActive: boolean;
	toolCall?: ToolCall | null;
	readTargetFilePath?: string | null;
	skillTarget?: string | null;
	latestMessage: LatestMessage | null;
	prompt?: string;
	skillInvocationPath?: string;
	isInterrupted?: boolean;
	terminationReason?: string;
}): NormalizedEvent {
	if (params.type === "tool") {
		assert(params.toolCall, "toolCall must be present for tool event");
		return {
			type: "tool",
			harness: params.harness,
			conversationId: params.conversationId,
			workspacePath: params.workspacePath,
			rawPayload: params.rawPayload,
			toolCall: params.toolCall,
			readTargetFilePath: params.readTargetFilePath ?? null,
			skillTarget: params.skillTarget ?? null,
		};
	}

	if (params.type === "stop") {
		return {
			type: "stop",
			harness: params.harness,
			conversationId: params.conversationId,
			workspacePath: params.workspacePath,
			rawPayload: params.rawPayload,
			isStop: true,
			stopHookActive: params.stopHookActive,
			isInterrupted: params.isInterrupted ?? false,
			terminationReason: params.terminationReason,
			latestMessage: params.latestMessage,
		};
	}

	return {
		type: "pre",
		harness: params.harness,
		conversationId: params.conversationId,
		workspacePath: params.workspacePath,
		rawPayload: params.rawPayload,
		prompt:
			params.prompt ??
			(params.latestMessage?.type === "USER_INPUT"
				? params.latestMessage.content
				: "") ??
			"",
		latestMessage: params.latestMessage,
		...(params.skillInvocationPath
			? { skillInvocationPath: params.skillInvocationPath }
			: {}),
	};
}
