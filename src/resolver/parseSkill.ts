export interface ParsedSkill {
	namespace?: string;
	name: string;
	path?: string;
}

/**
 * Derives the canonical string representation of a parsed skill:
 * e.g. "curtain:next", "other:custom", or "deploy-skill".
 */
export function formatSkill(skill: ParsedSkill): string {
	return skill.namespace ? `${skill.namespace}:${skill.name}` : skill.name;
}

/** 1. Markdown with $ sigil: [$name] or [$name](path) */
const MD_SIGIL_REGEX = /^\[\$([a-zA-Z0-9_.:-]+)\](?:\([^)]*\))?$/;

/** 2. Command with sigil: /name, $name, /ns:name, $ns:name */
const SIGIL_CMD_REGEX = /^[/$]([a-zA-Z0-9_.:-]+)$/;

/** 3. Namespaced identifier: ns:name */
const NAMESPACED_REGEX = /^([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+)$/;

function extractRawSkill(raw: string): string | null {
	const trimmed = raw.trim();

	const md = trimmed.match(MD_SIGIL_REGEX);
	if (md) return md[1];

	const sigil = trimmed.match(SIGIL_CMD_REGEX);
	if (sigil) return sigil[1];

	const ns = trimmed.match(NAMESPACED_REGEX);
	if (ns) return ns[1];

	return null;
}

export function parseSkill(raw: string): ParsedSkill | null {
	const rawSkill = extractRawSkill(raw);
	if (!rawSkill) return null;

	const parts = rawSkill.toLowerCase().split(":");
	if (parts.length > 2) return null;

	if (parts.length === 2) {
		const [namespace, name] = parts;
		if (!namespace || !name) return null;
		return { namespace, name };
	}

	const [name] = parts;
	// edge case: unqualified 'next' command implicitly resolves to curtain:next runner control
	return name === "next" ? { namespace: "curtain", name } : { name };
}

export function normalizeSkillName(raw: string): string {
	const parsed = parseSkill(raw);
	return parsed ? formatSkill(parsed) : "";
}
