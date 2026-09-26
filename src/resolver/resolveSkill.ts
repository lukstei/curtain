import * as fs from "node:fs";
import * as path from "node:path";
import { getHarness } from "../harnesses/index.ts";
import type { HarnessType } from "../harnesses/types.ts";
import { logDebug } from "../lib/logDebug.ts";
import type { ParsedSkill } from "./parseSkill.ts";

function findSkillInBaseDir(
	baseDir: string,
	skillName: string,
	maxDepth = 3,
): string | null {
	if (!fs.existsSync(baseDir)) return null;

	// 1. Direct path check: <baseDir>/<skillName>/SKILL.md
	const direct = path.join(baseDir, skillName, "SKILL.md");
	if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
		return direct;
	}

	// 2. Direct path check: <baseDir>/<skillName>.md
	const directMd = path.join(baseDir, `${skillName}.md`);
	if (fs.existsSync(directMd) && fs.statSync(directMd).isFile()) {
		return directMd;
	}

	// 3. Scan subdirectories (for plugins or marketplace caches)
	if (maxDepth <= 0) return null;

	try {
		const entries = fs.readdirSync(baseDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			// Skip hidden non-agent dirs or node_modules
			if (entry.name === "node_modules" || entry.name === ".git") continue;

			const sub = path.join(baseDir, entry.name);

			// Check sub/skills/<skillName>/SKILL.md
			const pluginSkill = path.join(sub, "skills", skillName, "SKILL.md");
			if (fs.existsSync(pluginSkill) && fs.statSync(pluginSkill).isFile()) {
				return pluginSkill;
			}

			// Check sub/<skillName>/SKILL.md
			const nestedDirect = path.join(sub, skillName, "SKILL.md");
			if (fs.existsSync(nestedDirect) && fs.statSync(nestedDirect).isFile()) {
				return nestedDirect;
			}

			// Recurse for nested plugin caches (e.g. marketplaces/org/repo/skills)
			const deeper = findSkillInBaseDir(sub, skillName, maxDepth - 1);
			if (deeper) return deeper;
		}
	} catch (err) {
		const isEnoent = (err as NodeJS.ErrnoException).code === "ENOENT";
		if (!isEnoent) {
			logDebug(`Failed to read directory at ${baseDir}`, err);
		}
	}

	return null;
}

/**
 * Resolves the absolute path to a skill's SKILL.md file, scoped to the active harness.
 */
export function resolveSkillPath(
	skill: ParsedSkill,
	harness: HarnessType,
	workspacePaths: readonly string[] = ["."],
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	const skillName = skill.name.trim();
	if (!skillName) return null;

	const adapter = getHarness(harness);
	if (!adapter.getSkillDirs) return null;

	const uniqueDirs = [...new Set(adapter.getSkillDirs(workspacePaths))];
	for (const dir of uniqueDirs) {
		const found = findSkillInBaseDir(dir, skillName);
		if (found) {
			return found;
		}
	}

	return null;
}

function checkPlaybookPath(resolvedPath: string): string | null {
	if (fs.existsSync(resolvedPath)) {
		const stat = fs.statSync(resolvedPath);
		if (stat.isDirectory()) {
			const directPlaybook = path.join(resolvedPath, "PLAYBOOK.md");
			if (
				fs.existsSync(directPlaybook) &&
				fs.statSync(directPlaybook).isFile()
			) {
				return directPlaybook;
			}
		} else if (stat.isFile()) {
			if (path.basename(resolvedPath).toUpperCase() === "PLAYBOOK.MD") {
				return resolvedPath;
			}
			// edge case: when given a SKILL.md file path, resolve to the sibling PLAYBOOK.md playbook file
			if (path.basename(resolvedPath).toUpperCase() === "SKILL.MD") {
				const sibling = path.join(path.dirname(resolvedPath), "PLAYBOOK.md");
				if (fs.existsSync(sibling) && fs.statSync(sibling).isFile()) {
					return sibling;
				}
			}
		}
	}
	return null;
}

/**
 * Resolves the PLAYBOOK.md file associated with a parsed skill.
 */
export function resolvePlaybookPath(
	skill: ParsedSkill,
	harness: HarnessType,
	workspacePaths: readonly string[] = ["."],
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	if (skill.path) {
		if (path.isAbsolute(skill.path)) {
			return checkPlaybookPath(skill.path);
		}
		for (const wp of workspacePaths) {
			const resolvedPath = path.resolve(wp, skill.path);
			const found = checkPlaybookPath(resolvedPath);
			if (found) return found;
		}
		return null;
	}

	const skillPath = resolveSkillPath(skill, harness, workspacePaths, env);
	if (skillPath) {
		const skillDir = path.dirname(skillPath);
		const playbook = path.join(skillDir, "PLAYBOOK.md");
		if (fs.existsSync(playbook) && fs.statSync(playbook).isFile()) {
			return playbook;
		}
	}

	return null;
}
