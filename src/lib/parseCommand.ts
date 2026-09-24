import {
	COMMAND_REGEX,
	FILE_AT_REGEX,
	FILE_BRACKET_REGEX,
	FILE_QUOTE_REGEX,
	WHITESPACE_SPLIT_REGEX,
} from "../regex.ts";

export type CurtainCommand = { name: "next" } | { name: "run"; path: string };

export interface ParseResult {
	isCurtainCommand: boolean;
	command?: CurtainCommand;
	error?: string;
}

function parseFilePath(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const bracketMatch = trimmed.match(FILE_BRACKET_REGEX);
	if (bracketMatch) return bracketMatch[1].trim();

	const quoteMatch = trimmed.match(FILE_QUOTE_REGEX);
	if (quoteMatch) return quoteMatch[1].trim();

	const atMatch = trimmed.match(FILE_AT_REGEX);
	if (atMatch) return atMatch[1].trim();

	return trimmed.split(WHITESPACE_SPLIT_REGEX)[0];
}

export function parseCommand(input?: string): ParseResult {
	if (!input) return { isCurtainCommand: false };

	const match = input.trim().match(COMMAND_REGEX);
	if (!match) return { isCurtainCommand: false };

	const [, prefix, name, rest] = match;
	const isCurtainPrefix = prefix.toLowerCase().includes("curtain");
	const command = name.toLowerCase();

	if (command === "next") {
		return { isCurtainCommand: true, command: { name: "next" } };
	}

	if (!isCurtainPrefix && command === "curtain") {
		const filePath = rest ? parseFilePath(rest) : null;
		if (filePath) {
			return {
				isCurtainCommand: true,
				command: { name: "run", path: filePath },
			};
		}
		return {
			isCurtainCommand: true,
			error: "Missing required script path argument.",
		};
	}

	if (isCurtainPrefix) {
		if (command === "run" || command === "start") {
			const filePath = rest ? parseFilePath(rest) : null;
			if (filePath) {
				return {
					isCurtainCommand: true,
					command: { name: "run", path: filePath },
				};
			}
			return {
				isCurtainCommand: true,
				error: "Missing required script path argument.",
			};
		}

		const fullArgs = [name, rest].filter(Boolean).join(" ");
		const filePath = parseFilePath(fullArgs);
		if (filePath) {
			return {
				isCurtainCommand: true,
				command: { name: "run", path: filePath },
			};
		}
		return {
			isCurtainCommand: true,
			error: "Missing required script path argument.",
		};
	}

	return { isCurtainCommand: false };
}
