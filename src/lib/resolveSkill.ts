import * as fs from "node:fs";
import * as path from "node:path";
import { getHarness, HARNESSES } from "../harnesses/index.ts";
import type { HarnessType } from "../harnesses/types.ts";
import { CALLOUT_ANNOTATION_REGEX } from "../regex.ts";

/**
 * Checks whether a markdown file contains at least one Curtain delimiter annotation.
 */
export function hasCurtainAnnotations(filePath: string): boolean {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		return CALLOUT_ANNOTATION_REGEX.test(content);
	} catch {
		return false;
	}
}

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
	} catch {
		// Ignore filesystem read errors
	}

	return null;
}

/**
 * Resolves the absolute path to a skill's SKILL.md file, scoped to the active harness.
 */
export function resolveSkillPath(
	skillName: string,
	harness?: HarnessType,
	workspacePath = ".",
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	const trimmedName = skillName.trim();
	if (!trimmedName) return null;

	// Handle namespaced skills: e.g. "plugin:skill" -> skill is "skill"
	const normalizedName = trimmedName.split(":").pop() ?? trimmedName;

	const skillDirs: string[] = [];

	if (harness) {
		const adapter = getHarness(harness);
		if (adapter.getSkillDirs) {
			skillDirs.push(...adapter.getSkillDirs(workspacePath, env));
		}
	} else {
		for (const h of HARNESSES) {
			if (h.getSkillDirs) {
				skillDirs.push(...h.getSkillDirs(workspacePath, env));
			}
		}
	}

	const uniqueDirs = [...new Set(skillDirs)];

	for (const dir of uniqueDirs) {
		const found = findSkillInBaseDir(dir, normalizedName);
		if (found) {
			return found;
		}
	}

	return null;
}

/**
 * Resolves the PLAYBOOK.md file associated with a skill name, directory, or path.
 */
export function resolvePlaybookPath(
	skillNameOrPath: string,
	harness?: HarnessType,
	workspacePath = ".",
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	const trimmed = skillNameOrPath.trim();
	if (!trimmed) return null;

	// 1. Direct check if path is already PLAYBOOK.md
	if (path.basename(trimmed).toUpperCase() === "PLAYBOOK.MD") {
		const directCandidate = path.isAbsolute(trimmed)
			? trimmed
			: path.resolve(workspacePath, trimmed);
		if (
			fs.existsSync(directCandidate) &&
			fs.statSync(directCandidate).isFile()
		) {
			return directCandidate;
		}
	}

	// 2. Direct check if path is a directory containing PLAYBOOK.md
	const dirCandidate = path.isAbsolute(trimmed)
		? trimmed
		: path.resolve(workspacePath, trimmed);
	if (fs.existsSync(dirCandidate) && fs.statSync(dirCandidate).isDirectory()) {
		const directPlaybook = path.join(dirCandidate, "PLAYBOOK.md");
		if (fs.existsSync(directPlaybook) && fs.statSync(directPlaybook).isFile()) {
			return directPlaybook;
		}
	}

	// 3. If trimmed is a file path ending in SKILL.md, check sibling PLAYBOOK.md
	if (path.basename(trimmed).toUpperCase() === "SKILL.MD") {
		const sibling = path.join(path.dirname(dirCandidate), "PLAYBOOK.md");
		if (fs.existsSync(sibling) && fs.statSync(sibling).isFile()) {
			return sibling;
		}
	}

	// 4. Try resolving as a skill name
	const skillPath = resolveSkillPath(trimmed, harness, workspacePath, env);
	if (skillPath) {
		const skillDir = path.dirname(skillPath);
		const playbook = path.join(skillDir, "PLAYBOOK.md");
		if (fs.existsSync(playbook) && fs.statSync(playbook).isFile()) {
			return playbook;
		}
	}

	return null;
}
