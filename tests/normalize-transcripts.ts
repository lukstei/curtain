import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessType } from "../src/harnesses/types.ts";

export type NormalizedTranscriptItem =
	| {
			type: "user";
			content: string;
	  }
	| {
			type: "assistant";
			content: string;
	  }
	| {
			type: "tool";
			name: string;
			args: Record<string, unknown>;
	  };

export type NormalizedTranscript = NormalizedTranscriptItem[];

const WORKSPACE_PATH_REGEX = /\/Users\/[^/\s"']+\/Downloads\/skill-test/g;

export function sanitizeWorkspacePath(text: string): string {
	return text.replace(WORKSPACE_PATH_REGEX, "{{workspace}}");
}

export function normalizeTranscript(
	rawContent: string,
	harness: HarnessType,
): NormalizedTranscript {
	const lines = rawContent.trim().split("\n").filter(Boolean);
	const result: NormalizedTranscriptItem[] = [];

	for (const line of lines) {
		let item: Record<string, unknown>;
		try {
			item = JSON.parse(line);
		} catch {
			continue;
		}

		if (harness === "codex") {
			const payload = item.payload as Record<string, unknown> | undefined;
			const meta = payload?.internal_chat_message_metadata_passthrough as
				| Record<string, unknown>
				| undefined;
			const contentKinds = meta?.content_item_kinds as string[] | undefined;
			const contentList = payload?.content as
				| Array<{ text?: string }>
				| undefined;
			const text = contentList?.[0]?.text;

			if (
				item.type === "response_item" &&
				payload?.role === "user" &&
				contentKinds?.includes("user.text") &&
				typeof text === "string"
			) {
				result.push({
					type: "user",
					content: sanitizeWorkspacePath(text),
				});
			} else if (
				item.type === "response_item" &&
				payload?.role === "assistant" &&
				typeof text === "string"
			) {
				result.push({
					type: "assistant",
					content: sanitizeWorkspacePath(text),
				});
			}
		} else if (harness === "agy") {
			const isUser =
				item.type === "USER_INPUT" || item.source === "USER_EXPLICIT";
			const isModel =
				(item.type === "PLANNER_RESPONSE" || item.source === "MODEL") &&
				item.type !== "GENERIC";

			if (isUser && typeof item.content === "string") {
				result.push({
					type: "user",
					content: sanitizeWorkspacePath(item.content),
				});
			} else if (isModel && typeof item.content === "string") {
				result.push({
					type: "assistant",
					content: sanitizeWorkspacePath(item.content),
				});
			}
		} else if (harness === "claude") {
			if (item.type === "user") {
				const msg = item.message as Record<string, unknown> | undefined;
				if (typeof msg?.content === "string") {
					result.push({
						type: "user",
						content: sanitizeWorkspacePath(msg.content),
					});
				} else if (Array.isArray(msg?.content)) {
					const textItem = msg.content.find(
						(c: { type?: string; text?: string }) =>
							c.type === "text" && typeof c.text === "string",
					);
					if (
						textItem &&
						typeof textItem.text === "string" &&
						!textItem.text.startsWith("Base directory for this skill:")
					) {
						result.push({
							type: "user",
							content: sanitizeWorkspacePath(textItem.text),
						});
					}
				}
			} else if (item.type === "assistant") {
				const msg = item.message as Record<string, unknown> | undefined;
				if (Array.isArray(msg?.content)) {
					const textItem = msg.content.find(
						(c: { type?: string; text?: string }) =>
							c.type === "text" && typeof c.text === "string",
					);
					if (textItem && typeof textItem.text === "string") {
						result.push({
							type: "assistant",
							content: sanitizeWorkspacePath(textItem.text),
						});
					}
				}
			}
		}
	}

	return result;
}

export function convertAllTranscripts(
	fixturesDir = path.resolve(import.meta.dirname, "fixtures/transcripts"),
): void {
	assert(
		fs.existsSync(fixturesDir),
		`Fixtures directory does not exist: ${fixturesDir}`,
	);

	const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const harness = entry.name as HarnessType;
		const harnessDir = path.join(fixturesDir, entry.name);
		const files = fs.readdirSync(harnessDir);

		for (const file of files) {
			if (!file.endsWith(".jsonl") || file.includes(".normalized.")) continue;

			const filePath = path.join(harnessDir, file);
			const rawContent = fs.readFileSync(filePath, "utf-8");
			const normalized = normalizeTranscript(rawContent, harness);

			const conversationId = path.basename(file, ".jsonl");
			const outputPath = path.join(
				harnessDir,
				`${conversationId}.normalized.json`,
			);

			fs.writeFileSync(
				outputPath,
				`${JSON.stringify(normalized, null, "\t")}\n`,
				"utf-8",
			);
		}
	}
}

export function findNormalizedTranscripts(
	fixturesDir = path.resolve(import.meta.dirname, "fixtures/transcripts"),
): Array<{
	harness: HarnessType;
	conversationId: string;
	filePath: string;
}> {
	assert(
		fs.existsSync(fixturesDir),
		`Fixtures directory does not exist: ${fixturesDir}`,
	);

	const results: Array<{
		harness: HarnessType;
		conversationId: string;
		filePath: string;
	}> = [];

	const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const harness = entry.name as HarnessType;
		const harnessDir = path.join(fixturesDir, entry.name);
		const files = fs.readdirSync(harnessDir);

		for (const file of files) {
			if (!file.endsWith(".normalized.json")) continue;
			const conversationId = file.replace(/\.normalized\.json$/, "");
			results.push({
				harness,
				conversationId,
				filePath: path.join(harnessDir, file),
			});
		}
	}

	assert(results.length > 0, "No normalized transcripts discovered");
	return results;
}

const isMain =
	process.argv[1] &&
	(process.argv[1] === fileURLToPath(import.meta.url) ||
		process.argv[1].endsWith("normalize-transcripts.ts"));

if (isMain) {
	convertAllTranscripts();
}
