import type { HookResponse } from "../types.ts";
import { defaultExtractLatestMessage } from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export const codexHarness: HarnessAdapter = {
	id: "codex",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return payload.hookEventName !== undefined || Boolean(env.CODEX_SESSION_ID);
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

		const isStop =
			modeArg === "stop" ||
			eventName === "Stop" ||
			payload.stop_hook_active !== undefined ||
			payload.stopHookActive !== undefined;

		const type: "pre" | "stop" = isStop ? "stop" : "pre";

		const prompt =
			typeof payload.prompt === "string" ? payload.prompt : undefined;
		const stopHookActive = Boolean(
			payload.stop_hook_active ?? payload.stopHookActive,
		);

		const partialEvent: NormalizedEvent = {
			type,
			harness: "codex",
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
						suppressOutput: true,
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
};
