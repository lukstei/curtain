import type {
	HookResponse,
	HookType,
	LatestMessage,
	ToolCall,
} from "../types.ts";

export type HarnessType = "claude" | "codex" | "agy" | "copilot";

export interface EgressOutput {
	stdout?: string;
	stderr?: string;
	exitCode: number;
}

export interface NormalizedEvent {
	type: HookType;
	harness: HarnessType;
	conversationId: string;
	workspacePath: string;
	prompt?: string;
	isStop: boolean;
	stopHookActive: boolean;
	terminationReason?: string;
	isInterrupted: boolean;
	latestMessage: LatestMessage | null;
	toolCall?: ToolCall | null;
	readTargetFilePath?: string | null;
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
	extractFileReadTarget?(
		toolCall: ToolCall,
		workspacePath: string,
	): string | null;
	resolveConversationId?(env: NodeJS.ProcessEnv): string | null;
	resolveStorageDir?(env: NodeJS.ProcessEnv): string | null;
	getSkillDirs?(workspacePath: string, env?: NodeJS.ProcessEnv): string[];
}
