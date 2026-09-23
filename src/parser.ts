import assert from "node:assert/strict";

export interface Step {
	index: number;
	type: "auto" | "pause";
	content: string;
}

export interface Script {
	filePath: string;
	steps: Step[];
}

const DELIMITER_REGEX = /^##\s*<curtain(?::(auto|gate|pause))?>\s*$/gim;

export function parseScript(content: string, filePath: string): Script {
	assert(typeof content === "string", "Script content must be a string");
	assert(filePath.trim().length > 0, "filePath must be provided");

	const matches: Array<{
		index: number;
		length: number;
		type: "auto" | "pause";
	}> = [];

	let match: RegExpExecArray | null = DELIMITER_REGEX.exec(content);
	while (match !== null) {
		const subtype = match[1]?.toLowerCase();
		matches.push({
			index: match.index,
			length: match[0].length,
			type: subtype === "gate" || subtype === "pause" ? "pause" : "auto",
		});
		match = DELIMITER_REGEX.exec(content);
	}

	const steps: Step[] = [];

	if (matches.length === 0) {
		const trimmed = content.trim();
		assert(
			trimmed.length > 0,
			`Script file "${filePath}" contains no content.`,
		);
		steps.push({
			index: 0,
			type: "auto",
			content: trimmed,
		});
		return { filePath, steps };
	}

	let lastEnd = 0;
	let currentType: "auto" | "pause" = "auto";

	for (const m of matches) {
		const chunk = content.slice(lastEnd, m.index).trim();
		if (chunk.length > 0) {
			steps.push({
				index: steps.length,
				type: currentType,
				content: chunk,
			});
		}
		currentType = m.type;
		lastEnd = m.index + m.length;
	}

	const finalChunk = content.slice(lastEnd).trim();
	if (finalChunk.length > 0) {
		steps.push({
			index: steps.length,
			type: currentType,
			content: finalChunk,
		});
	}

	assert(
		steps.length > 0,
		`Script file "${filePath}" contains no executable steps.`,
	);
	return { filePath, steps };
}
