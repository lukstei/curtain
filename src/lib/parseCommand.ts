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

export function parseCommand(
	input?: string,
	skillInvocationPath?: string,
): UserIntent {
	const trimmed = input?.trim();
	let rawSkill: string | undefined;
	let targetPath: string | undefined;
	let rest: string | undefined;
	let isCommandSigil = false;

	if (trimmed) {
		const linkMatch = trimmed.match(SKILL_LINK_WITH_OPTIONAL_PATH_REGEX);
		if (linkMatch && (trimmed.startsWith("[$") || linkMatch[2])) {
			rawSkill = linkMatch[1];
			targetPath = linkMatch[2]
				?.replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "")
				.trim();
			rest = linkMatch[3]?.trim();
		} else if (trimmed.startsWith("/") || trimmed.startsWith("$")) {
			const [first, ...trailing] = trimmed.split(WHITESPACE_SPLIT_REGEX);
			rawSkill = first;
			rest = trailing.join(" ").trim() || undefined;
			isCommandSigil = true;
		}
	}

	if (!rawSkill && skillInvocationPath) {
		rawSkill = resolveSkillNameFromPath(skillInvocationPath) ?? undefined;
		targetPath = skillInvocationPath;
		rest = trimmed;
	}

	if (!rawSkill) {
		return { type: "none" };
	}

	const parsed = parseSkill(rawSkill);
	if (!parsed) return { type: "none" };

	const curtain = handleCurtainIntent(parsed, rest);
	if (curtain) return curtain;

	if (isCommandSigil && !BARE_SKILL_COMMAND_REGEX.test(rawSkill)) {
		return { type: "none" };
	}

	return {
		type: "skill",
		skill: parsed,
		...(targetPath ? { targetPath } : {}),
	};
}
