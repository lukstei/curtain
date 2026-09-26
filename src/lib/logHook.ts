import * as fs from "node:fs";
import * as path from "node:path";
import { getHookLogPath, type RunnerState } from "../state.ts";
import type { LatestMessage } from "../types.ts";

export interface HookLogEntry {
	timestamp: string;
	hook: string;
	input: string;
	output: string;
	latestMessage?: LatestMessage | null;
	state?: RunnerState | null;
}

export function logHookInvocation(
	conversationId: string,
	entry: HookLogEntry,
	env: NodeJS.ProcessEnv = process.env,
): void {
	try {
		const filePath = getHookLogPath(conversationId, env);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
	} catch {
		// Ignore logging errors in runtime
	}
}
