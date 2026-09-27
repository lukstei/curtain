// see reference docs: docs/harnesses/claude.md
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
import { normalizeSkillName } from "../resolver/index.ts";
import type { HookMode, ToolCall } from "../types.ts";
import {
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.ts";

type ClaudeEvent =
	| { kind: "session_start" }
	| { kind: "prompt"; prompt: string; cwd: string }
	| { kind: "stop" }
	| { kind: "tool"; toolCall: ToolCall; cwd: string };

function parseClaudeEvent(
	payload: Record<string, unknown>,
	mode: HookMode,
): ClaudeEvent {
	if (mode === "pre") {
		if (typeof payload.prompt === "string" && payload.prompt.trim()) {
			assert(typeof payload.cwd === "string", "Claude payload requires cwd");
			return { kind: "prompt", prompt: payload.prompt, cwd: payload.cwd };
		}
		return { kind: "session_start" };
	}

	if (mode === "stop") {
		return { kind: "stop" };
	}

	const toolCall = extractToolCall(payload);
	assert(toolCall, "Missing tool call in tool event");
	assert(typeof payload.cwd === "string", "Claude payload requires cwd");
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
					hookSpecificOutput: {
						hookEventName: "UserPromptSubmit",
						additionalContext: res.message,
					},
				}),
			},
			nextState: res.nextState,
		};
	}

	if (res.action === "error") {
		return {
			egress: {
				exitCode: 2,
				stderr: res.message,
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
		return {
			egress: {
				exitCode: 0,
				stdout: JSON.stringify({
					hookSpecificOutput: {
						hookEventName: "Stop",
						additionalContext: res.message,
					},
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
		toolCall.args.file_path ??
		toolCall.args.path ??
		toolCall.args.filePath ??
		toolCall.args.AbsolutePath;

	return typeof rawPath === "string"
		? resolveToolReadPath(rawPath, [cwd])
		: null;
}

function extractClaudeSkillTarget(toolCall: ToolCall): string | null {
	if (toolCall.name === "Skill" || toolCall.name.endsWith("__Skill")) {
		const raw = toolCall.args.skill ?? toolCall.args.name;
		if (typeof raw !== "string") return null;
		const trimmed = raw.trim();
		// edge case: Claude invokes Skill tool with bare names without leading slash
		const target =
			trimmed.startsWith("/") || trimmed.startsWith("$")
				? trimmed
				: `/${trimmed}`;
		return normalizeSkillName(target);
	}
	return null;
}

function handleToolEvent(
	event: Extract<ClaudeEvent, { kind: "tool" }>,
	ctx: HarnessContext,
): HarnessResult {
	// edge case: intercept Skill tool calls to run playbooks behind the curtain or prevent illegal skill re-invocation
	const skillName = extractClaudeSkillTarget(event.toolCall);
	if (skillName) {
		const outcome = resolveSkillInvocation({
			skillName,
			state: ctx.state,
			workspacePaths: [event.cwd],
			harness: "claude",
		});
		if (
			outcome.action === "start" ||
			outcome.action === "resume" ||
			outcome.action === "block"
		) {
			return {
				egress: { exitCode: 2, stderr: outcome.message },
				nextState: outcome.nextState,
			};
		}
		return {
			egress: { exitCode: 0, stdout: "{}" },
			nextState: outcome.nextState,
		};
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
			return {
				egress: { exitCode: 2, stderr: backstage.reason },
				nextState: ctx.state,
			};
		}
	}

	return {
		egress: { exitCode: 0, stdout: "{}" },
		nextState: ctx.state,
	};
}

export const claudeHarness: HarnessAdapter = {
	id: "claude",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		if (env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_PLUGIN_DATA) return true;
		// edge case: Claude Code payloads share hook_event_name with Codex and Copilot but omit turn_id and timestamp
		return (
			payload.hook_event_name !== undefined &&
			payload.turn_id === undefined &&
			payload.timestamp === undefined
		);
	},

	resolveConversationId(
		payload: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
	): string {
		return String(
			payload.session_id ?? env.CLAUDE_CODE_SESSION_ID ?? "default",
		);
	},

	handle(payload: Record<string, unknown>, ctx: HarnessContext): HarnessResult {
		const event = parseClaudeEvent(payload, ctx.mode);

		switch (event.kind) {
			case "session_start":
				return { egress: { exitCode: 0, stdout: "{}" }, nextState: ctx.state };

			case "prompt": {
				const res = resolveUserPrompt({
					prompt: event.prompt,
					state: ctx.state,
					workspacePaths: [event.cwd],
					harness: "claude",
				});
				return formatPromptEgress(res);
			}

			case "stop": {
				if (!ctx.state) {
					return { egress: { exitCode: 0, stdout: "{}" }, nextState: null };
				}
				const res = advanceTurn({
					state: ctx.state,
					terminationReason: null,
				});
				return formatStopEgress(res);
			}

			case "tool":
				return handleToolEvent(event, ctx);
		}
	},

	getSkillDirs(workspacePaths: string[]): string[] {
		const home = os.homedir();
		const dirs = [
			...getGenericSkillDirs(workspacePaths),
			...workspacePaths.flatMap((wp) => [
				path.join(wp, ".claude/skills"),
				path.join(wp, ".claude/plugins"),
			]),
			path.join(home, ".claude/skills"),
			path.join(home, ".claude/plugins/marketplaces"),
			path.join(home, ".claude/plugins/cache"),
		];
		// edge case: CLAUDE_PLUGIN_ROOT is dynamically exported by Claude plugin host when running as a plugin
		if (process.env.CLAUDE_PLUGIN_ROOT) {
			dirs.push(path.join(process.env.CLAUDE_PLUGIN_ROOT, "skills"));
		}
		return dirs;
	},
};
