import * as fs from "node:fs";
import * as path from "node:path";
import { resolvePlaybookPath } from "./lib/resolveSkill.ts";
import { parseScript, type Script } from "./parser.ts";
import { RESOLVER_BRACKET_REGEX, RESOLVER_QUOTE_REGEX } from "./regex.ts";

export function resolveScriptPath(
	userPath: string,
	workspacePaths?: string[],
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	let cleanPath = userPath.trim();
	const bracketMatch = cleanPath.match(RESOLVER_BRACKET_REGEX);
	if (bracketMatch) {
		cleanPath = bracketMatch[1].trim();
	} else {
		if (cleanPath.startsWith("@")) {
			cleanPath = cleanPath.slice(1).trim();
		}
		const quoteMatch = cleanPath.match(RESOLVER_QUOTE_REGEX);
		if (quoteMatch) {
			cleanPath = quoteMatch[1].trim();
		}
	}

	// Reject any explicit file path that does not end in PLAYBOOK.md
	if (
		path.extname(cleanPath) &&
		path.basename(cleanPath).toUpperCase() !== "PLAYBOOK.MD"
	) {
		return null;
	}

	const searchRoots = [...(workspacePaths ?? []), process.cwd()];

	// 1. Check if cleanPath is or contains PLAYBOOK.md directly
	for (const root of searchRoots) {
		const candidate = path.isAbsolute(cleanPath)
			? cleanPath
			: path.resolve(root, cleanPath);

		if (fs.existsSync(candidate)) {
			const stat = fs.statSync(candidate);
			if (
				stat.isFile() &&
				path.basename(candidate).toUpperCase() === "PLAYBOOK.MD"
			) {
				return candidate;
			}
			if (stat.isDirectory()) {
				const pb = path.join(candidate, "PLAYBOOK.md");
				if (fs.existsSync(pb) && fs.statSync(pb).isFile()) {
					return pb;
				}
			}
		}
	}

	// 2. Try resolving as a skill name across workspace roots
	for (const root of searchRoots) {
		const found = resolvePlaybookPath(cleanPath, undefined, root, env);
		if (found) return found;
	}

	return null;
}

export function loadScript(
	targetPath: string,
	workspacePaths?: string[],
): { filePath: string; script: Script } | { error: string } | null {
	const resolved = resolveScriptPath(targetPath, workspacePaths);
	if (!resolved) {
		if (
			path.extname(targetPath) &&
			path.basename(targetPath).toUpperCase() !== "PLAYBOOK.MD"
		) {
			return {
				error:
					"Curtain scripts must be named PLAYBOOK.md. Custom script files are not supported.",
			};
		}
		return null;
	}

	try {
		const content = fs.readFileSync(resolved, "utf-8");
		const script = parseScript(content, resolved);
		return { filePath: resolved, script };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { error: `Failed to load script "${targetPath}": ${message}` };
	}
}
