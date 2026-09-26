import * as path from "node:path";
import { type ParsedSkill, parseSkill } from "../resolver/index.ts";

/** Splits a string by one or more whitespace characters. */
export const WHITESPACE_SPLIT_REGEX = /\s+/;

export type UserIntent =
	| { type: "next" }
	| { type: "skill"; skill: ParsedSkill }
	| { type: "none" };

export function resolveSkillNameFromPath(skillPath?: string): string | null {
	if (!skillPath) return null;
	const fileName = path.basename(skillPath);
	// edge case: directory-based skills name the file SKILL.md, so skill name is the parent folder
	if (fileName.toLowerCase() === "skill.md") {
		return path.basename(path.dirname(skillPath)).toLowerCase();
	}
	return null;
}

export function parseCommand(
	input?: string,
	skillInvocationPath?: string,
): UserIntent {
	const trimmed = input?.trim();
	if (trimmed) {
		const token = trimmed.split(WHITESPACE_SPLIT_REGEX)[0];
		const parsed = parseSkill(token);
		if (parsed) {
			if (parsed.namespace === "curtain" && parsed.name === "next") {
				return { type: "next" };
			}
			return {
				type: "skill",
				skill: parsed,
			};
		}
	}

	if (skillInvocationPath) {
		const name = resolveSkillNameFromPath(skillInvocationPath);
		// edge case: harness metadata passes skill file path directly instead of user prompt command
		if (name === "next") return { type: "next" };
		if (name) {
			return {
				type: "skill",
				skill: { name, path: skillInvocationPath },
			};
		}
	}

	return { type: "none" };
}
