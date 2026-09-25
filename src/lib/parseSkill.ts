export interface ParsedSkill {
	namespace?: string;
	name: string;
}

/**
 * Derives the canonical string representation of a parsed skill:
 * e.g. "curtain:next", "other:custom", or "deploy-skill".
 */
export function formatSkill(skill: ParsedSkill): string {
	return skill.namespace ? `${skill.namespace}:${skill.name}` : skill.name;
}

/**
 * Parses any skill string, Markdown link, or command mention into a structured ParsedSkill.
 *
 * Rules:
 * 1. Strips Markdown link wrappers ([$name](url) -> name, [$name] -> name, [name] -> name).
 * 2. Strips leading command sigils (/ or $).
 * 3. Splits on ":".
 *    - If namespace is "curtain", validates against known skills ("next" | "curtain").
 *      Removed subcommands ("start", "run") return null.
 *    - If no namespace is present but skill is "next" or "curtain", assumes "curtain" namespace.
 *    - Other namespaces and custom skills are preserved as-is.
 */
export function parseSkill(raw: string): ParsedSkill | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	// 1. Strip Markdown link or bracket wrapper: [$name](url) -> $name, [name] -> name
	const unbracketed = trimmed
		.replace(/^\[\$?([^\]]+)\](?:\([^)]*\))?.*$/, "$1")
		.trim();

	// 2. Strip leading command sigils: / or $
	const cleaned = unbracketed
		.replace(/^[/$]+/, "")
		.trim()
		.toLowerCase();
	if (!cleaned) return null;

	// 3. Parse namespace and skill name
	const parts = cleaned.split(":");
	if (parts.length > 2) return null;

	if (parts.length === 2) {
		const [ns, skill] = parts;
		if (!ns || !skill) return null;

		if (ns === "curtain") {
			if (skill === "start" || skill === "run") {
				return null;
			}
			if (skill === "next" || skill === "curtain") {
				return { namespace: "curtain", name: skill };
			}
			return null;
		}

		return { namespace: ns, name: skill };
	}

	const [skill] = parts;
	if (!skill) return null;

	if (skill === "next" || skill === "curtain") {
		return { namespace: "curtain", name: skill };
	}

	return { name: skill };
}

export function normalizeSkillName(raw: string): string {
	const parsed = parseSkill(raw);
	return parsed ? formatSkill(parsed) : "";
}
