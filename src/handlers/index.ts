import { assertNever } from "../lib/assertNever.ts";
import type { RunnerState } from "../state.ts";
import type { HookInfo, HookResponse } from "../types.ts";
import { type HandlerResult, handlePre } from "./pre.ts";
import { handleStop } from "./stop.ts";
import { handlePreTool } from "./tool.ts";

export { assertNever } from "../lib/assertNever.ts";
export { type HandlerResult, handlePre } from "./pre.ts";
export { handleStop } from "./stop.ts";
export { handlePreTool } from "./tool.ts";

export type HookResult = HandlerResult<HookResponse>;

export function handle(info: HookInfo, state: RunnerState | null): HookResult {
	switch (info.type) {
		case "stop":
			return handleStop(info, state);
		case "pre":
			return handlePre(info, state);
		case "tool":
			return handlePreTool(info, state);
		default:
			return assertNever(info);
	}
}
