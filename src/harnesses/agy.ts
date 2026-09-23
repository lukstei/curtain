import {
	getLatestMessage,
	defaultTranscriptParser as parseAgyMessage,
} from "../lib/getLatestMessage.ts";
import type { HookResponse, LatestMessage } from "../types.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export { parseAgyMessage };

export const agyHarness: HarnessAdapter = {
	id: "agy",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		if (env.AGY_HOOK_ACTIVE || env.ANTIGRAVITY_CONVERSATION_ID) {
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

		const isStop =
			modeArg === "stop" ||
			Boolean(terminationReason && payload.invocationNum === undefined);

		const type: "pre" | "stop" = isStop ? "stop" : "pre";

		const prompt =
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const isInterrupted = Boolean(
			terminationReason && /cancel|abort|interrupt/i.test(terminationReason),
		);
		const stopHookActive = Boolean(
			typeof payload.executionNum === "number" && payload.executionNum > 1,
		);

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
			rawPayload: payload,
		};

		partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
		return partialEvent;
	},

	extractLatestMessage(event: NormalizedEvent): LatestMessage | null {
		const invocationNum =
			typeof event.rawPayload.invocationNum === "number"
				? event.rawPayload.invocationNum
				: undefined;
		if (
			event.type === "pre" &&
			invocationNum !== undefined &&
			invocationNum > 1
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

		return { exitCode: 0, stdout: JSON.stringify(response) };
	},

	resolveConversationId(env: NodeJS.ProcessEnv): string | null {
		return env.ANTIGRAVITY_CONVERSATION_ID || null;
	},

	resolveStorageDir(env: NodeJS.ProcessEnv): string | null {
		return env.AGY_PLUGIN_DATA || null;
	},
};
