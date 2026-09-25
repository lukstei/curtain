import type { RunnerState } from "../state.ts";
import type { HookInfo, HookResponse } from "../types.ts";
import { type HandlerResult, handlePre } from "./pre.ts";
import { handleStop } from "./stop.ts";
import { handlePreTool } from "./tool.ts";

export { type HandlerResult, handlePre } from "./pre.ts";
export { handleStop } from "./stop.ts";
export { handlePreTool } from "./tool.ts";

export function handle(
	info: HookInfo,
	state: RunnerState | null,
): HandlerResult<HookResponse> {
	if (info.type === "stop") {
		return handleStop(info, state);
	}
	if (info.type === "pre") {
		return handlePre(info, state);
	}
	if (info.type === "tool") {
		return handlePreTool(info, state);
	}
	throw new Error(`Unknown hook type: ${(info as { type?: unknown }).type}`);
}
