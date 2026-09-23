export interface LatestMessage {
	type: string;
	content: string;
}

export type HookType = "pre" | "stop" | "tool";

export interface ToolCall {
	name: string;
	args: Record<string, unknown>;
}

export interface HookInfo {
	type: HookType;
	conversationId: string;
	workspacePath: string;
	prompt?: string;
	terminationReason?: string;
	latestMessage?: LatestMessage | null;
	harness?: string;
	toolCall?: ToolCall;
	readTargetFilePath?: string;
}

export interface HookResponse {
	decision?: "allow" | "continue" | "block" | "deny";
	reason?: string;
	injectSteps?: Array<{ ephemeralMessage?: string }>;
}
