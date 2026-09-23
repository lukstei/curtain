import type { HookResponse, LatestMessage, ToolCall } from "../types.ts";

export type HarnessType = "claude" | "codex" | "agy" | "copilot";

export interface EgressOutput {
	stdout?: string;
	stderr?: string;
	exitCode: number;
}

type BaseNormalizedEvent = {
	harness: HarnessType;
	conversationId: string;
	workspacePath: string;
	rawPayload: Record<string, unknown>;
};

export type NormalizedEvent = BaseNormalizedEvent &
	(
		| {
				type: "pre";
				prompt: string;
				latestMessage: LatestMessage | null;
				skillInvocationPath?: string;
		  }
		| {
				type: "stop";
				isStop: true;
				stopHookActive: boolean;
				isInterrupted: boolean;
				terminationReason?: string;
				latestMessage: LatestMessage | null;
		  }
		| {
				type: "tool";
				toolCall: ToolCall;
				readTargetFilePath?: string | null;
		  }
	);

export interface HarnessAdapter {
	readonly id: HarnessType;
	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean;
	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env?: NodeJS.ProcessEnv,
	): NormalizedEvent;
	formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput;
	extractLatestMessage(event: {
		type: "pre" | "stop" | "tool";
		prompt?: string;
		rawPayload: Record<string, unknown>;
	}): LatestMessage | null;
	extractFileReadTarget?(
		toolCall: ToolCall,
		workspacePath: string,
	): string | null;
	resolveConversationId?(env: NodeJS.ProcessEnv): string | null;
	resolveStorageDir?(env: NodeJS.ProcessEnv): string | null;
	getSkillDirs?(workspacePath: string, env?: NodeJS.ProcessEnv): string[];
}
