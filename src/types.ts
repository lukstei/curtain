import type { Script } from "./parser/index.ts";

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

export type ResolvedScriptResult =
	| { type: "resolved"; script: Script; skillName?: string }
	| { type: "none" };

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

export type PreHookResponse =
	| { action: "inject"; message: string }
	| { action: "pass" };

export type StopHookResponse =
	| { action: "allow" }
	| { action: "continue"; reason: string };

export type ToolHookResponse =
	| { action: "allow" }
	| { action: "deny"; reason: string };

export type HookResponse =
	| PreHookResponse
	| StopHookResponse
	| ToolHookResponse;
