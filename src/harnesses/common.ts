import * as path from "node:path";
import { getLatestMessage } from "../lib/getLatestMessage.ts";
import type { LatestMessage, ToolCall } from "../types.ts";
import type { NormalizedEvent } from "./types.ts";

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
export function defaultExtractLatestMessage(
	event: NormalizedEvent,
): LatestMessage | null {
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
