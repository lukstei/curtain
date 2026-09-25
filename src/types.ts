export interface LatestMessage {
	type: string;
	content: string;
	skillInvocationPath?: string;
}

export type HookType = "pre" | "stop" | "tool";

export interface ToolCall {
	name: string;
	args: Record<string, unknown>;
}

type BaseHookInfo = {
	conversationId: string;
	workspacePath: string;
	harness?: string;
};

export type HookInfo = BaseHookInfo &
	(
		| {
				type: "pre";
				prompt: string;
				skillInvocationPath?: string;
		  }
		| {
				type: "stop";
				terminationReason?: string;
		  }
		| {
				type: "tool";
				toolCall: ToolCall;
				readTargetFilePath?: string | null;
				skillTarget?: string | null;
		  }
	);

export interface HookResponse {
	decision?: "allow" | "continue" | "block" | "deny";
	reason?: string;
	injectSteps?: Array<{ ephemeralMessage?: string }>;
}
