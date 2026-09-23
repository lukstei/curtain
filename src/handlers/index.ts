import type { RunnerState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { type HandlerResult, handlePre } from "./pre.ts";
import { handleStop } from "./stop.ts";
import { handlePreTool } from "./tool.ts";

export { type HandlerResult, handlePre } from "./pre.ts";
export { handleStop } from "./stop.ts";
export { handlePreTool } from "./tool.ts";

export function handle(
	info: HookInfo,
	state: RunnerState | null,
	env: NodeJS.ProcessEnv = process.env,
): HandlerResult {
	if (info.type === "stop") {
		return handleStop(info, state, env);
	}
	if (info.type === "pre") {
		return handlePre(info, state, env);
	}
	if (info.type === "tool") {
		return handlePreTool(info, state);
	}
	throw new Error(`Unknown hook type: ${(info as { type?: unknown }).type}`);
}
