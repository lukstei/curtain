import * as fs from "node:fs";
import * as path from "node:path";
import { getDebugLogPath } from "../state.ts";

export function logDebug(message: string, data?: unknown) {
	if (process.env.VITEST && !process.env.CURTAIN_DEBUG) {
		return;
	}
	const line = `[${(logDebug.conversationId ?? "unknown").split("-")[0]}] ${message} ${
		data !== undefined ? JSON.stringify(data, null, 2) : ""
	}\n`;
	try {
		const filePath = getDebugLogPath(logDebug.conversationId);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.appendFileSync(filePath, line);
	} catch {
		// Ignore logging errors
	}
}
logDebug.conversationId = undefined as string | undefined;
