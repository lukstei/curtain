import * as path from "node:path";
import {
	ANGLE_BRACKET_ENCLOSURE_REGEX,
	BARE_SKILL_COMMAND_REGEX,
	FILE_AT_REGEX,
	FILE_BRACKET_REGEX,
	FILE_QUOTE_REGEX,
	SKILL_LINK_WITH_OPTIONAL_PATH_REGEX,
	WHITESPACE_SPLIT_REGEX,
} from "../regex.ts";
import { type ParsedSkill, parseSkill } from "./parseSkill.ts";

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
