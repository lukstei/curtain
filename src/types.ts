export interface LatestMessage {
	type: string;
	content: string;
}

export interface HookInfo {
	type: "pre" | "stop";
	conversationId: string;
	workspacePath: string;
	prompt?: string;
	terminationReason?: string;
	latestMessage?: LatestMessage | null;
}

export interface HookResponse {
	decision?: "allow" | "continue" | "block";
	reason?: string;
	injectSteps?: Array<{ ephemeralMessage?: string }>;
}
