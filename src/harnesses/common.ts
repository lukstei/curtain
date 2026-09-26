import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeSkillName } from "../resolver/index.ts";
import type { ToolCall } from "../types.ts";

export function getGenericSkillDirs(
	workspacePaths: readonly string[],
): string[] {
	return workspacePaths.flatMap((wp) => [
		path.join(wp, ".agents/skills"),
		path.join(wp, "skills"),
	]);
}

export function extractToolCall(
	payload: Record<string, unknown>,
): ToolCall | null {
	if (
		payload.toolCall &&
		typeof payload.toolCall === "object" &&
		"name" in (payload.toolCall as object)
	) {
		const tc = payload.toolCall as {
			name: string;
			args?: Record<string, unknown>;
		};
		return { name: tc.name, args: tc.args ?? {} };
	}

	const toolName =
		typeof payload.tool_name === "string"
			? payload.tool_name
			: typeof payload.toolName === "string"
				? payload.toolName
				: undefined;

	if (toolName) {
		const rawArgs =
			payload.tool_input ??
			payload.toolInput ??
			payload.args ??
			payload.arguments;
		const args =
			typeof rawArgs === "object" && rawArgs !== null
				? (rawArgs as Record<string, unknown>)
				: {};
		return { name: toolName, args };
	}

	return null;
}

export function resolveToolReadPath(
	rawPath: unknown,
	workspacePaths: readonly string[],
): string {
	const target = typeof rawPath === "string" ? rawPath.trim() : "";
	if (path.isAbsolute(target)) {
		return target;
	}
	for (const wp of workspacePaths) {
		const resolved = path.resolve(wp, target);
		if (fs.existsSync(resolved)) {
			return resolved;
		}
	}
	return path.resolve(workspacePaths[0] ?? ".", target);
}

export function defaultExtractSkillTarget(toolCall: ToolCall): string | null {
	if (
		toolCall.name === "Skill" ||
		toolCall.name === "invoke_skill" ||
		toolCall.name.endsWith("__Skill")
	) {
		const skill =
			toolCall.args.skill ?? toolCall.args.name ?? toolCall.args.skill_name;
		return typeof skill === "string" ? normalizeSkillName(skill) : null;
	}
	return null;
}
