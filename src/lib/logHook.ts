import * as fs from "node:fs";
import * as path from "node:path";
import { getHookLogPath, type RunnerState } from "../state.ts";

export interface HookLogEntry {
	timestamp: string;
	hook: string;
	input: string;
	output: string;
	state?: (RunnerState | Omit<RunnerState, "steps">) | null;
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
