// see reference docs: docs/harnesses/agy.md
import * as os from "node:os";
import * as path from "node:path";
import {
	getLatestMessage,
	defaultTranscriptParser as parseAgyMessage,
} from "../lib/getLatestMessage.ts";
import type { HookResponse, LatestMessage, ToolCall } from "../types.ts";
import {
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export { parseAgyMessage };

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
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const isInterrupted = Boolean(
			terminationReason && /cancel|abort|interrupt/i.test(terminationReason),
		);
		const stopHookActive = Boolean(
			typeof payload.executionNum === "number" && payload.executionNum > 1,
		);

		const toolCall = extractToolCall(payload);
		const readTargetFilePath = toolCall
			? (this.extractFileReadTarget?.(toolCall, workspacePath) ?? null)
			: null;

		const partialEvent: NormalizedEvent = {
			type,
			harness: "agy",
			conversationId,
			workspacePath,
			prompt,
			isStop,
			stopHookActive,
			terminationReason,
			isInterrupted,
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
		if (toolCall.name !== "view_file") return null;
		return resolveToolReadPath(
			toolCall.args.AbsolutePath ?? toolCall.args.path,
			workspacePath,
		);
	},

	extractLatestMessage(event: NormalizedEvent): LatestMessage | null {
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
