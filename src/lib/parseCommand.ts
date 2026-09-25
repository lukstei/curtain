import * as path from "node:path";
import { type ParsedSkill, parseSkill } from "../resolver/index.ts";

/** Matches a Markdown skill link with optional path and optional trailing arguments. */
export const SKILL_LINK_WITH_OPTIONAL_PATH_REGEX =
	/^\[\$?([a-zA-Z0-9_.:-]+)\](?:\(([^)]+)\))?(?:\s+([\s\S]*))?$/;

/** Matches a bare slash or dollar command invoking a skill (e.g. `/my-skill`, `$my-skill`). */
export const BARE_SKILL_COMMAND_REGEX = /^[/$]([a-zA-Z0-9_.:-]+)$/;

/** Strips enclosing `<` and `>` angle brackets from paths in Markdown links. */
export const ANGLE_BRACKET_ENCLOSURE_REGEX = /^<|>$/g;

/** Matches runner command prefix (/ or $ or /curtain: or $curtain:) and extracts the command name and rest. */
export const COMMAND_REGEX = /^([/$]curtain[:\s]+|[/$])([^\s]+)(?:\s+(.*))?$/i;
export const CURTAIN_COMMAND_REGEX = COMMAND_REGEX;

/** Extracts a bracketed file path argument prefixed with `@` (e.g. `@[path/to/file]`). */
export const FILE_BRACKET_REGEX = /^@\[([^\]]+)\]/;

/** Extracts a quoted file path argument (e.g. `"path/to/file"`). */
export const FILE_QUOTE_REGEX = /^["']([^"']+)["']/;

/** Extracts an unquoted file path argument prefixed with `@` (e.g. `@path/to/file`). */
export const FILE_AT_REGEX = /^@(\S+)/;

/** Splits a string by one or more whitespace characters. */
export const WHITESPACE_SPLIT_REGEX = /\s+/;

export type UserIntent =
	| { type: "next" }
	| { type: "run"; path: string }
	| { type: "skill"; skill?: ParsedSkill; targetPath?: string }
	| { type: "none" }
	| { type: "error"; error: string };

export function cleanFilePathArgument(raw: string): string | null {
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

function resolveSkillNameFromPath(skillPath?: string): string | null {
	if (!skillPath) return null;
	const fileName = path.basename(skillPath);
	if (fileName.toLowerCase() === "skill.md") {
		return path.basename(path.dirname(skillPath)).toLowerCase();
	}
	return path.parse(fileName).name.toLowerCase();
}

function handleCurtainIntent(
	parsed: ParsedSkill,
	rest?: string,
): UserIntent | null {
	if (parsed.namespace !== "curtain") return null;
	if (parsed.name === "next") return { type: "next" };
	if (parsed.name === "curtain") {
		if (rest?.trim().toLowerCase() === "next") return { type: "next" };
		const filePath = rest ? cleanFilePathArgument(rest) : null;
		if (filePath) return { type: "run", path: filePath };
		return { type: "error", error: "Missing required script path argument." };
	}
	return null;
}

export function parseCommand(
	input?: string,
	skillInvocationPath?: string,
): UserIntent {
	const trimmed = input?.trim();

	if (trimmed) {
		// 1. Link-style: [skill-name](path) rest
		const linkMatch = trimmed.match(SKILL_LINK_WITH_OPTIONAL_PATH_REGEX);
		if (linkMatch) {
			const [, rawName, rawTargetPath, rest] = linkMatch;
			const parsed = parseSkill(rawName);
			if (parsed) {
				const curtain = handleCurtainIntent(parsed, rest);
				if (curtain) return curtain;

				const targetPath = rawTargetPath
					?.replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "")
					.trim();
				return {
					type: "skill",
					skill: parsed,
					...(targetPath ? { targetPath } : {}),
				};
			}
		}

		// 2. Slash/dollar command: /skill args or $skill args
		if (trimmed.startsWith("/") || trimmed.startsWith("$")) {
			const [firstWord, ...restWords] = trimmed.split(WHITESPACE_SPLIT_REGEX);
			const rest = restWords.join(" ").trim();
			const parsed = parseSkill(firstWord);
			if (parsed) {
				const curtain = handleCurtainIntent(parsed, rest);
				if (curtain) return curtain;

				if (!rest && BARE_SKILL_COMMAND_REGEX.test(trimmed)) {
					return { type: "skill", skill: parsed };
				}
			}
		}
	}

	// 3. Fallback: resolve from invocation path
	const fallbackName = resolveSkillNameFromPath(skillInvocationPath);
	const fallback = fallbackName ? parseSkill(fallbackName) : null;
	if (fallback) {
		const curtain = handleCurtainIntent(fallback, trimmed);
		if (curtain) return curtain;
		return { type: "skill", skill: fallback, targetPath: skillInvocationPath };
	}
	if (skillInvocationPath) {
		return { type: "skill", targetPath: skillInvocationPath };
	}

	return { type: "none" };
}
