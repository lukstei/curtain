const CURTAIN_COMMANDS: Record<string, string> = {
	next: "curtain:next",
	curtain: "curtain:curtain",
};

/**
 * Normalizes a skill or command name to a canonical identifier:
 * 1. Strips markdown bracket wrappers (e.g. `[$next]`, `[curtain:next]`).
 * 2. Strips leading command sigils (`/`, `$`).
 * 3. Expands known Curtain runner commands missing a namespace into `curtain:<cmd>`.
 * 4. Preserves foreign plugin namespaces or bare custom skills.
 */
export function normalizeSkillName(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return "";

	let cleaned = trimmed
		.replace(/^\[\$?/, "")
		.replace(/\]$/, "")
		.trim();
	cleaned = cleaned.replace(/^[/$]+/, "").trim();

	const lower = cleaned.toLowerCase();
	if (!lower.includes(":")) {
		return CURTAIN_COMMANDS[lower] ?? lower;
	}

	return lower;
}
