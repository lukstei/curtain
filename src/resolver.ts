import * as fs from "node:fs";
import * as path from "node:path";
import { parseScript, type Script } from "./parser.ts";
import { RESOLVER_BRACKET_REGEX, RESOLVER_QUOTE_REGEX } from "./regex.ts";

export function resolveScriptPath(
	userPath: string,
	workspacePaths?: string[],
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

	function checkCandidate(candidatePath: string): string | null {
		try {
			if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
				return candidatePath;
			}
			if (!path.extname(candidatePath)) {
				for (const ext of [".md", ".markdown"]) {
					const candidate = candidatePath + ext;
					if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
						return candidate;
					}
				}
			}
		} catch {
			// Ignore fs errors
		}
		return null;
	}

	if (path.isAbsolute(cleanPath)) {
		const found = checkCandidate(cleanPath);
		if (found) return found;
	}

	if (workspacePaths && workspacePaths.length > 0) {
		for (const ws of workspacePaths) {
			const resolved = checkCandidate(path.resolve(ws, cleanPath));
			if (resolved) return resolved;
		}
	}

	const cwdResolved = checkCandidate(path.resolve(process.cwd(), cleanPath));
	if (cwdResolved) return cwdResolved;

	return null;
}

export function loadScript(
	targetPath: string,
	workspacePaths?: string[],
): { filePath: string; script: Script } | { error: string } | null {
	const resolved = resolveScriptPath(targetPath, workspacePaths);
	if (!resolved) return null;

	try {
		const content = fs.readFileSync(resolved, "utf-8");
		const script = parseScript(content, resolved);
		return { filePath: resolved, script };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { error: `Failed to load script "${targetPath}": ${message}` };
	}
}
