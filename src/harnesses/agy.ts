// see reference docs: docs/harnesses/agy.md
import * as os from "node:os";
import * as path from "node:path";
import { getLatestMessage } from "../lib/getLatestMessage.ts";
import {
	AGY_SKILL_PATH_REGEX,
	TERMINATION_CANCEL_REGEX,
	USER_REQUEST_TAG_REGEX,
} from "../regex.ts";
import type { HookResponse, LatestMessage, ToolCall } from "../types.ts";
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

export function parseAgyMessage(
	item: Record<string, unknown>,
): LatestMessage | null {
	const isUser = item.type === "USER_INPUT" || item.source === "USER_EXPLICIT";
	const isModel =
		(item.type === "PLANNER_RESPONSE" || item.source === "MODEL") &&
		item.type !== "GENERIC";

	if (isModel && typeof item.content === "string") {
		return {
			type: "PLANNER_RESPONSE",
			content: item.content,
		};
	}

	if (isUser && typeof item.content === "string") {
		const skillInvocationPath = extractSkillPath(item.content);
		return {
			type: "USER_INPUT",
			content: stripUserRequest(item.content),
			...(skillInvocationPath ? { skillInvocationPath } : {}),
		};
	}

	return null;
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
		const isStop =
			!isTool &&
			(modeArg === "stop" ||
				Boolean(terminationReason && payload.invocationNum === undefined));

		const type: "pre" | "stop" | "tool" = isTool
			? "tool"
			: isStop
				? "stop"
				: "pre";

		const prompt =
			typeof payload.prompt === "string"
				? stripUserRequest(payload.prompt)
				: undefined;

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

		const latestMessage = this.extractLatestMessage({
			type,
			prompt,
			rawPayload: payload,
		});

		const skillInvocationPath =
			latestMessage?.skillInvocationPath ??
			(typeof payload.prompt === "string"
				? extractSkillPath(payload.prompt)
				: undefined);

		return createNormalizedEvent({
			harness: "agy",
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

	extractLatestMessage(event: {
		type: "pre" | "stop" | "tool";
		prompt?: string;
		rawPayload: Record<string, unknown>;
	}): LatestMessage | null {
		const invocationNum =
			typeof event.rawPayload.invocationNum === "number"
				? event.rawPayload.invocationNum
				: undefined;
		if (
			event.type === "pre" &&
			invocationNum !== undefined &&
			invocationNum > 0
		) {
			return null;
		}

		const rawTranscript =
			event.rawPayload.transcriptPath ?? event.rawPayload.transcript_path;
		if (typeof rawTranscript === "string") {
			const msg = getLatestMessage(rawTranscript, parseAgyMessage);
			if (msg) return msg;
		}

		if (event.type === "stop") {
			const rawAssistant =
				event.rawPayload.last_assistant_message ??
				event.rawPayload.lastAssistantMessage;
			if (typeof rawAssistant === "string" && rawAssistant.length > 0) {
				return {
					type: "PLANNER_RESPONSE",
					content: rawAssistant,
				};
			}
		}

		if (event.prompt) {
			const skillInvocationPath =
				typeof event.rawPayload.prompt === "string"
					? extractSkillPath(event.rawPayload.prompt)
					: undefined;
			return {
				type: "USER_INPUT",
				content: stripUserRequest(event.prompt),
				...(skillInvocationPath ? { skillInvocationPath } : {}),
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
			const ephemeralMessage =
				response.injectSteps?.[0]?.ephemeralMessage || "";
			if (!ephemeralMessage) {
				return { exitCode: 0, stdout: "{}" };
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					injectSteps: [{ ephemeralMessage }],
				}),
			};
		}

		if (event.type === "tool") {
			if (response.decision === "deny") {
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

		return { exitCode: 0, stdout: JSON.stringify(response) };
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
