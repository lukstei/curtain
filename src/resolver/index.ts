import * as fs from "node:fs";
import type { HarnessType } from "../harnesses/types.ts";
import type { UserIntent } from "../lib/parseCommand.ts";
import {
	CALLOUT_ANNOTATION_REGEX,
	parseScript,
	type Script,
} from "../parser/index.ts";
import type { ResolvedScriptResult } from "../types.ts";
import { resolvePlaybookPath } from "./resolveSkill.ts";

export * from "./parseSkill.ts";
export * from "./resolveSkill.ts";

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
		if (!CALLOUT_ANNOTATION_REGEX.test(content)) return null;
		const script = parseScript(content, playbookPath);
		return script.steps.length > 1 ? script : null;
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
	if (intent.type === "skill") {
		const target = intent.targetPath ?? intent.skill.name;
		const script = loadSkillScript(target, workspacePath, harness);
		if (script) {
			return { type: "resolved", script, skillName: intent.skill.name };
		}
	}

	return { type: "none" };
}
