import type { HookResponse, LatestMessage } from "../types.ts";

export type HarnessType = "claude" | "codex" | "agy" | "copilot";

export interface EgressOutput {
	stdout?: string;
	stderr?: string;
	exitCode: number;
}

export interface NormalizedEvent {
	type: "pre" | "stop";
	harness: HarnessType;
	conversationId: string;
	workspacePath: string;
	prompt?: string;
	isStop: boolean;
	stopHookActive: boolean;
	terminationReason?: string;
	isInterrupted: boolean;
	latestMessage: LatestMessage | null;
	rawPayload: Record<string, unknown>;
}

export interface HarnessAdapter {
	readonly id: HarnessType;
	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean;
	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env?: NodeJS.ProcessEnv,
	): NormalizedEvent;
	formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput;
	extractLatestMessage(event: NormalizedEvent): LatestMessage | null;
	resolveConversationId?(env: NodeJS.ProcessEnv): string | null;
	resolveStorageDir?(env: NodeJS.ProcessEnv): string | null;
}
