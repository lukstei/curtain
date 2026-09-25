import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessType } from "./harnesses/types.ts";
import { cleanFilePathArgument } from "./lib/parseCommand.ts";
import {
	hasCurtainAnnotations,
	resolvePlaybookPath,
} from "./lib/resolveSkill.ts";
import { parseScript, type Script } from "./parser.ts";

export function resolveScriptPath(
	userPath: string,
	workspacePaths?: string[],
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	const cleanPath = cleanFilePathArgument(userPath);
	if (!cleanPath) {
		return null;
	}

	// If an explicit file extension is provided, require markdown
	if (path.extname(cleanPath)) {
		const ext = path.extname(cleanPath).toLowerCase();
		if (ext !== ".md" && ext !== ".markdown") {
			return null;
		}
	}

	const searchRoots = [...(workspacePaths ?? []), process.cwd()];

	// 1. Check if cleanPath is a direct file or directory containing PLAYBOOK.md
	for (const root of searchRoots) {
		const candidate = path.isAbsolute(cleanPath)
			? cleanPath
			: path.resolve(root, cleanPath);

		if (fs.existsSync(candidate)) {
			const stat = fs.statSync(candidate);
			if (stat.isFile()) {
				const ext = path.extname(candidate).toLowerCase();
				if (ext === ".md" || ext === ".markdown") {
					return candidate;
				}
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
		if (path.extname(targetPath)) {
			const ext = path.extname(targetPath).toLowerCase();
			if (ext !== ".md" && ext !== ".markdown") {
				return {
					error: "Curtain scripts must be Markdown files (.md or .markdown).",
				};
			}
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

/**
 * Loads a multi-step Curtain script associated with a skill or target path.
 * Verifies that the resolved playbook exists, contains curtain callout annotations,
 * and contains more than one step.
 */
export function loadSkillScript(
	target?: string | null,
	workspacePath = ".",
	harness?: HarnessType,
): Script | null {
	if (!target?.trim()) return null;

	const playbookPath = resolvePlaybookPath(target, harness, workspacePath);
	if (!playbookPath || !hasCurtainAnnotations(playbookPath)) {
		return null;
	}

	const loaded = loadScript(playbookPath, [workspacePath]);
	if (!loaded || "error" in loaded || loaded.script.steps.length <= 1) {
		return null;
	}

	return loaded.script;
}
