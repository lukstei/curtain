import type { Script } from "./parser/index.ts";

export type HookMode = "pre" | "tool" | "stop";

export interface ToolCall {
	name: string;
	args: Record<string, unknown>;
}

export type ResolvedScriptResult =
	| { type: "resolved"; script: Script; skillName?: string }
	| { type: "none" };

