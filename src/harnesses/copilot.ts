import type { HookResponse } from "../types.ts";
import { defaultExtractLatestMessage } from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export const copilotHarness: HarnessAdapter = {
	id: "copilot",

	detect(_payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return Boolean(env.COPILOT_PLUGIN_DATA || env.COPILOT_SESSION_ID);
	},

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(
			payload.sessionId ??
				payload.session_id ??
				payload.conversationId ??
				"default",
		);
		const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
		const eventName = payload.hook_event_name ?? payload.hookEventName;

		const isStop =
			modeArg === "stop" ||
			eventName === "Stop" ||
			payload.stop_hook_active !== undefined ||
			payload.stopHookActive !== undefined;

		const type: "pre" | "stop" = isStop ? "stop" : "pre";

		const prompt =
			typeof payload.prompt === "string"
				? payload.prompt
				: typeof payload.initial_prompt === "string"
					? payload.initial_prompt
					: typeof payload.initialPrompt === "string"
						? payload.initialPrompt
						: undefined;

		const stopHookActive = Boolean(
			payload.stop_hook_active ?? payload.stopHookActive,
		);

		const partialEvent: NormalizedEvent = {
			type,
			harness: "copilot",
			conversationId,
			workspacePath,
			prompt,
			isStop,
			stopHookActive,
			isInterrupted: false,
			latestMessage: null,
			rawPayload: payload,
		};

		partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
		return partialEvent;
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

		if (event.type === "pre") {
			const text = response.injectSteps?.[0]?.ephemeralMessage || "";
			if (!text) {
				return { exitCode: 0, stdout: "{}" };
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					additionalContext: text,
				}),
			};
		}

		return { exitCode: 0, stdout: JSON.stringify(response) };
	},

	resolveConversationId(env: NodeJS.ProcessEnv): string | null {
		return env.COPILOT_SESSION_ID || null;
	},

	resolveStorageDir(env: NodeJS.ProcessEnv): string | null {
		return env.COPILOT_PLUGIN_DATA || null;
	},
};
