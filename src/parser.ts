import assert from "node:assert/strict";
import type { MarkdownNode } from "./lib/markdown/ast.ts";
import { parse } from "./lib/markdown/parsing.ts";
import {
	BLOCKQUOTE_PREFIX_REGEX,
	CALLOUT_LINE_REGEX,
	LINE_SPLIT_REGEX,
} from "./regex.ts";

export interface Step {
	index: number;
	type: "auto" | "pause"; // Delimiter concluding this step
	content: string; // Markdown content of the step
	instruction?: string; // Optional delimiter instruction
}

export interface Script {
	filePath: string;
	steps: Step[];
}

function getDelimiterInfo(
	node: MarkdownNode,
): { type: "auto" | "pause"; instruction?: string } | null {
	if (node.type !== "blockquote") {
		return null;
	}

	const rawLines = node.source
		.split(LINE_SPLIT_REGEX)
		.map((line) => line.replace(BLOCKQUOTE_PREFIX_REGEX, ""));
	const match = CALLOUT_LINE_REGEX.exec(rawLines[0]);
	if (!match) {
		return null;
	}

	const type: "auto" | "pause" =
		match[1].toLowerCase() === "curtain" ? "auto" : "pause";
	const fullInstruction = [match[2], ...rawLines.slice(1)].join("\n").trim();
	const instruction = fullInstruction.length > 0 ? fullInstruction : undefined;

	return {
		type,
		...(instruction ? { instruction } : {}),
	};
}

export function parseScript(content: string, filePath: string): Script {
	assert(typeof content === "string", "Script content must be a string");
	assert(filePath.trim().length > 0, "filePath must be provided");

	const trimmed = content.trim();
	assert(trimmed.length > 0, `Script file "${filePath}" contains no content.`);

	const ast = parse(content);
	const topLevelBlocks = ast.type === "fragment" ? ast.children : [ast];

	const steps: Step[] = [];
	let currentBlocks: MarkdownNode[] = [];

	for (const block of topLevelBlocks) {
		const delimiter = getDelimiterInfo(block);
		if (delimiter !== null) {
			assert(
				currentBlocks.length > 0,
				`Curtain delimiters cannot appear consecutively or at the beginning of script "${filePath}".`,
			);
			const chunk = currentBlocks
				.map((b) => b.source)
				.join("\n\n")
				.trim();
			if (chunk.length > 0) {
				steps.push({
					index: steps.length,
					type: delimiter.type,
					content: chunk,
					...(delimiter.instruction
						? { instruction: delimiter.instruction }
						: {}),
				});
			}
			currentBlocks = [];
		} else {
			currentBlocks.push(block);
		}
	}

	if (currentBlocks.length > 0) {
		const chunk = currentBlocks
			.map((b) => b.source)
			.join("\n\n")
			.trim();
		if (chunk.length > 0) {
			steps.push({
				index: steps.length,
				type: "auto",
				content: chunk,
			});
		}
	}

	assert(
		steps.length > 0,
		`Script file "${filePath}" contains no executable steps.`,
	);
	return { filePath, steps };
}
