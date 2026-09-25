import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessType } from "../harnesses/types.ts";
import { cleanFilePathArgument, type UserIntent } from "../lib/parseCommand.ts";
import {
	CALLOUT_ANNOTATION_REGEX,
	parseScript,
	type Script,
} from "../parser/index.ts";
import type { ResolvedScriptResult } from "../types.ts";
import { resolvePlaybookPath } from "./resolveSkill.ts";

export * from "./parseSkill.ts";
export * from "./resolveSkill.ts";

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
	if (!playbookPath) {
		return null;
	}

	try {
		const content = fs.readFileSync(playbookPath, "utf-8");
		if (!CALLOUT_ANNOTATION_REGEX.test(content)) {
			return null;
		}
		const script = parseScript(content, playbookPath);
		if (script.steps.length <= 1) {
			return null;
		}
		return script;
	} catch {
		return null;
	}
}

/**
 * Resolves a script associated with a parsed user intent across workspaces.
 */
export function resolveIntentScript(
	intent: UserIntent,
	workspacePath: string,
	harness?: HarnessType,
): ResolvedScriptResult {
	if (intent.type === "run") {
		const loaded = loadScript(intent.path, [workspacePath]);
		if (!loaded || "error" in loaded) {
			const err = !loaded
				? `Script file not found: "${intent.path}"`
				: loaded.error;
			return { type: "error", error: err };
		}
		return { type: "resolved", script: loaded.script };
	}

	if (intent.type === "skill") {
		const target = intent.targetPath ?? intent.skill?.name;
		const script = loadSkillScript(target, workspacePath, harness);
		if (script) {
			return { type: "resolved", script, skillName: intent.skill?.name };
		}
		return { type: "none" };
	}

	return { type: "none" };
}
