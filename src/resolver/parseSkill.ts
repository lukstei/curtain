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
	if (trimmed.startsWith("[")) {
		const isSigil = trimmed.startsWith("[$");
		const hasPath = /\]\([^)]+\)/.test(trimmed);
		const name = trimmed
			.replace(/^\[\$?([^\]]+)\].*$/, "$1")
			.trim()
			.toLowerCase();
		const isCurtain = name === "next" || name === "curtain";
		if (!isSigil && !hasPath && !isCurtain) {
			return null;
		}
	}

	const cleaned = trimmed
		.replace(/^\[\$?([^\]]+)\](?:\([^)]*\))?.*$/, "$1")
		.replace(/^[/$]+/, "")
		.trim()
		.toLowerCase();
	if (!cleaned) return null;

	const parts = cleaned.split(":");
	if (parts.length > 2) return null;

	const ns = parts.length === 2 ? parts[0] : undefined;
	const skill = parts.at(-1);
	if (!skill || (ns !== undefined && !ns)) return null;

	if (ns === "curtain" || (!ns && (skill === "next" || skill === "curtain"))) {
		return skill === "next" || skill === "curtain"
			? { namespace: "curtain", name: skill }
			: null;
	}

	return ns ? { namespace: ns, name: skill } : { name: skill };
}

export function normalizeSkillName(raw: string): string {
	const parsed = parseSkill(raw);
	return parsed ? formatSkill(parsed) : "";
}
