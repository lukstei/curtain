import * as fs from "node:fs";
import type { LatestMessage } from "../types.ts";

export type TranscriptItemParser = (
	item: Record<string, unknown>,
) => LatestMessage | null;

export function defaultTranscriptParser(
	item: Record<string, unknown>,
): LatestMessage | null {
	const isUser = item.type === "USER_INPUT" || item.source === "USER_EXPLICIT";
	const isModel =
		(item.type === "PLANNER_RESPONSE" || item.source === "MODEL") &&
		item.type !== "GENERIC";

	if ((isUser || isModel) && typeof item.content === "string") {
		return {
			type: isUser ? "USER_INPUT" : "PLANNER_RESPONSE",
			content: item.content,
		};
	}

	return null;
}

export function getLatestMessage(
	transcriptPath?: string,
	parseItem: TranscriptItemParser = defaultTranscriptParser,
): LatestMessage | null {
	if (!transcriptPath || !fs.existsSync(transcriptPath)) {
		return null;
	}

	try {
		const stat = fs.statSync(transcriptPath);
		const readSize = Math.min(stat.size, 256 * 1024);
		const buffer = Buffer.alloc(readSize);
		const fd = fs.openSync(transcriptPath, "r");
		fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
		fs.closeSync(fd);

		const chunk = buffer.toString("utf-8");
		const lines = chunk.split("\n").filter((l) => l.trim().length > 0);

		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const item = JSON.parse(lines[i]);
				if (item && typeof item === "object") {
					const parsed = parseItem(item as Record<string, unknown>);
					if (parsed) {
						return parsed;
					}
				}
			} catch {
				// Continue searching
			}
		}
	} catch {
		// Ignore transcript read errors
	}

	return null;
}
