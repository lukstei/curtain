// see reference docs: docs/harnesses/codex.md
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import {
	type AdvanceTurnResult,
	advanceTurn,
	guardBackstageRead,
	resolveSkillInvocation,
	resolveUserPrompt,
	type UserPromptResult,
} from "../actions.ts";
import type { RunnerState } from "../state.ts";
import type { HookMode, ToolCall } from "../types.ts";
import {
	defaultExtractSkillTarget,
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.ts";

/** Extracts skill name and target file path from an embedded Markdown link mention. */
export const SKILL_LINK_PATH_CAPTURE_REGEX =
	/\[\$?([a-zA-Z0-9_.:-]+)\]\(([^)]+)\)/;

/** Extracts the skill file path from a `<skill><path>...</path></skill>` XML block. */
export const XML_SKILL_PATH_REGEX =
	/<skill>[\s\S]*?<path>([^<]+)<\/path>[\s\S]*?<\/skill>/i;

/** Strips enclosing `<` and `>` angle brackets from paths in Markdown links. */
export const ANGLE_BRACKET_ENCLOSURE_REGEX = /^<|>$/g;

export function extractCodexSkillPath(
	text: string,
	workspacePath: string,
): string | undefined {
	const linkMatch = text.match(SKILL_LINK_PATH_CAPTURE_REGEX);
	if (linkMatch?.[2]) {
		const raw = linkMatch[2].replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "").trim();
		return resolveToolReadPath(raw, [workspacePath]);
	}
	const xmlMatch = text.match(XML_SKILL_PATH_REGEX);
	if (xmlMatch?.[1]) {
		const raw = xmlMatch[1].replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "").trim();
		return resolveToolReadPath(raw, [workspacePath]);
	}
	return undefined;
}

type CodexEvent =
	| { kind: "session_start" }
	| { kind: "prompt"; prompt: string; cwd: string }
	| { kind: "stop"; terminationReason: string | null }
	| { kind: "tool"; toolCall: ToolCall; cwd: string };

function parseCodexEvent(
	payload: Record<string, unknown>,
	mode: HookMode,
): CodexEvent {
	if (mode === "pre") {
		if (typeof payload.prompt === "string" && payload.prompt.trim()) {
			assert(typeof payload.cwd === "string", "Codex payload requires cwd");
			return { kind: "prompt", prompt: payload.prompt, cwd: payload.cwd };
		}
		return { kind: "session_start" };
	}

	if (mode === "stop") {
		const terminationReason =
			typeof payload.terminationReason === "string"
				? payload.terminationReason
				: null;
		return { kind: "stop", terminationReason };
	}

	const toolCall = extractToolCall(payload);
	assert(toolCall, "Missing tool call in tool event");
	assert(typeof payload.cwd === "string", "Codex payload requires cwd");
	return { kind: "tool", toolCall, cwd: payload.cwd };
}

function formatPromptEgress(res: UserPromptResult): HarnessResult {
	if (
		res.action === "start" ||
		res.action === "resume" ||
		res.action === "intermission_nudge"
	) {
		return {
			egress: {
				exitCode: 0,
				stdout: JSON.stringify({
					systemMessage: "[CURTAIN]",
					hookSpecificOutput: {
						hookEventName: "UserPromptSubmit",
						additionalContext: res.message,
					},
					suppressOutput: true,
				}),
			},
			nextState: res.nextState,
		};
	}

	if (res.action === "error") {
		return {
			egress: {
				exitCode: 0,
				stdout: JSON.stringify({
					decision: "block",
					reason: res.message,
				}),
			},
			nextState: res.nextState,
		};
	}

	return {
		egress: { exitCode: 0, stdout: "{}" },
		nextState: res.nextState,
	};
}

function formatStopEgress(res: AdvanceTurnResult): HarnessResult {
	if (res.action === "continue") {
		// edge case: Codex Stop hook requires decision: 'block' to prevent agent stop and inject continuation prompt
		return {
			egress: {
				exitCode: 0,
				stdout: JSON.stringify({
					decision: "block",
					reason: res.message,
					suppressOutput: true,
				}),
			},
			nextState: res.nextState,
		};
	}

	return {
		egress: { exitCode: 0, stdout: "{}" },
		nextState: res.nextState,
	};
}

function codexToolDeny(
	reason: string,
	nextState: RunnerState | null,
): HarnessResult {
	return {
		egress: {
			exitCode: 0,
			stdout: JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: reason,
				},
			}),
		},
		nextState,
	};
}

function codexToolAllow(nextState: RunnerState | null): HarnessResult {
	return {
		egress: { exitCode: 0, stdout: "{}" },
		nextState,
	};
}

function extractFileReadTarget(toolCall: ToolCall, cwd: string): string | null {
	const isReadTool =
		toolCall.name === "read_file" ||
		toolCall.name === "view_file" ||
		toolCall.name === "Read" ||
		toolCall.name === "View" ||
		toolCall.name === "mcp__filesystem__read_file" ||
		toolCall.name.endsWith("__read_file") ||
		toolCall.name.endsWith("__view_file");

	if (!isReadTool) return null;

	const rawPath =
		toolCall.args.path ??
		toolCall.args.file_path ??
		toolCall.args.filePath ??
		toolCall.args.AbsolutePath;

	return typeof rawPath === "string"
		? resolveToolReadPath(rawPath, [cwd])
		: null;
}

function handleToolEvent(
	event: Extract<CodexEvent, { kind: "tool" }>,
	ctx: HarnessContext,
): HarnessResult {
	// edge case: intercept Skill tool calls to run playbooks behind the curtain or prevent illegal skill re-invocation
	const skillName = defaultExtractSkillTarget(event.toolCall);
	if (skillName) {
		const outcome = resolveSkillInvocation({
			skillName,
			state: ctx.state,
			workspacePaths: [event.cwd],
			harness: "codex",
		});
		if (
			outcome.action === "start" ||
			outcome.action === "resume" ||
			outcome.action === "block"
		) {
			return codexToolDeny(outcome.message, outcome.nextState);
		}
		return codexToolAllow(outcome.nextState);
	}

	// edge case: guard against model inspecting backstage playbook scripts via file reading tools
	const readTargetPath = extractFileReadTarget(event.toolCall, event.cwd);
	if (readTargetPath && ctx.state) {
		const backstage = guardBackstageRead({
			readPath: readTargetPath,
			state: ctx.state,
			workspacePaths: [event.cwd],
		});
		if (backstage.blocked) {
			return codexToolDeny(backstage.reason, ctx.state);
		}
	}

	return codexToolAllow(ctx.state);
}

export const codexHarness: HarnessAdapter = {
	id: "codex",

	detect(_payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return Boolean(env.CODEX_SESSION_ID || env.PLUGIN_DATA);
	},

	resolveConversationId(
		payload: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
	): string {
		return String(payload.session_id ?? env.CODEX_SESSION_ID ?? "default");
	},

	handle(payload: Record<string, unknown>, ctx: HarnessContext): HarnessResult {
		const event = parseCodexEvent(payload, ctx.mode);

		switch (event.kind) {
			case "session_start":
				return { egress: { exitCode: 0, stdout: "{}" }, nextState: ctx.state };

			case "prompt": {
				const skillInvocationPath = extractCodexSkillPath(
					event.prompt,
					event.cwd,
				);
				const res = resolveUserPrompt({
					prompt: event.prompt,
					state: ctx.state,
					workspacePaths: [event.cwd],
					harness: "codex",
					skillInvocationPath,
				});
				return formatPromptEgress(res);
			}

			case "stop": {
				if (!ctx.state) {
					return { egress: { exitCode: 0, stdout: "{}" }, nextState: null };
				}
				const res = advanceTurn({
					state: ctx.state,
					terminationReason: event.terminationReason,
				});
				return formatStopEgress(res);
			}

			case "tool":
				return handleToolEvent(event, ctx);
		}
	},

	getSkillDirs(workspacePaths: string[]): string[] {
		const home = os.homedir();
		return [
			...getGenericSkillDirs(workspacePaths),
			...workspacePaths.flatMap((wp) => [
				path.join(wp, ".codex/skills"),
				path.join(wp, ".codex/plugins"),
			]),
			path.join(home, ".codex/skills"),
			path.join(home, ".codex/plugins/cache"),
			path.join(home, ".codex/plugins/marketplaces"),
		];
	},
};
