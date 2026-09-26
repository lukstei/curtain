import * as path from "node:path";
import { type ParsedSkill, parseSkill } from "../resolver/index.ts";

/** Matches a Markdown skill link with optional path and optional trailing arguments. */
export const SKILL_LINK_WITH_OPTIONAL_PATH_REGEX =
	/^\[\$?([a-zA-Z0-9_.:-]+)\](?:\(([^)]+)\))?(?:\s+([\s\S]*))?$/;

/** Matches a bare slash or dollar command invoking a skill (e.g. `/my-skill`, `$my-skill`). */
export const BARE_SKILL_COMMAND_REGEX = /^[/$]([a-zA-Z0-9_.:-]+)$/;

/** Strips enclosing `<` and `>` angle brackets from paths in Markdown links. */
export const ANGLE_BRACKET_ENCLOSURE_REGEX = /^<|>$/g;

/** Splits a string by one or more whitespace characters. */
export const WHITESPACE_SPLIT_REGEX = /\s+/;

export type UserIntent =
	| { type: "next" }
	| { type: "skill"; skill: ParsedSkill; targetPath?: string }
	| { type: "none" }
	| { type: "error"; error: string };

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
		return {
			type: "error",
			error:
				"Curtain is an instruction runner. Start a workflow by invoking its skill directly (e.g. /<skill-name>).",
		};
	}
	return null;
}

interface SkillSource {
	rawSkill: string;
	targetPath?: string;
	rest?: string;
	isCommandSigil: boolean;
}

function extractSkillSource(
	trimmed: string | undefined,
	skillInvocationPath: string | undefined,
): SkillSource | undefined {
	if (trimmed) {
		const linkMatch = trimmed.match(SKILL_LINK_WITH_OPTIONAL_PATH_REGEX);
		if (linkMatch) {
			return {
				rawSkill: linkMatch[3]
					? trimmed.slice(0, -linkMatch[3].length).trim()
					: trimmed,
				targetPath: linkMatch[2]
					?.replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "")
					.trim(),
				rest: linkMatch[3]?.trim(),
				isCommandSigil: false,
			};
		}
		if (trimmed.startsWith("/") || trimmed.startsWith("$")) {
			const [first, ...trailing] = trimmed.split(WHITESPACE_SPLIT_REGEX);
			return {
				rawSkill: first,
				rest: trailing.join(" ").trim() || undefined,
				isCommandSigil: true,
			};
		}
	}

	if (skillInvocationPath) {
		const name = resolveSkillNameFromPath(skillInvocationPath);
		if (name) {
			return {
				rawSkill: name,
				targetPath: skillInvocationPath,
				rest: trimmed,
				isCommandSigil: false,
			};
		}
	}
}

export function parseCommand(
	input?: string,
	skillInvocationPath?: string,
): UserIntent {
	const source = extractSkillSource(input?.trim(), skillInvocationPath);
	if (!source) return { type: "none" };

	const parsed = parseSkill(source.rawSkill);
	if (!parsed) return { type: "none" };

	const curtain = handleCurtainIntent(parsed, source.rest);
	if (curtain) return curtain;

	if (
		source.isCommandSigil &&
		!BARE_SKILL_COMMAND_REGEX.test(source.rawSkill)
	) {
		return { type: "none" };
	}

	return {
		type: "skill",
		skill: parsed,
		...(source.targetPath ? { targetPath: source.targetPath } : {}),
	};
}
