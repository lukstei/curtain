import * as path from "node:path";
import { normalizeSkillName } from "../resolver/index.ts";
import type { ToolCall } from "../types.ts";

export function getGenericSkillDirs(workspacePath: string): string[] {
	return [
		path.join(workspacePath, ".agents/skills"),
		path.join(workspacePath, "skills"),
	];
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
	workspacePath: string,
): string | null {
	if (typeof rawPath !== "string" || !rawPath.trim()) return null;
	const target = rawPath.trim();
	return path.isAbsolute(target) ? target : path.resolve(workspacePath, target);
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


