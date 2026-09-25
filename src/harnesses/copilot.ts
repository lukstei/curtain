// see reference docs: docs/harnesses/copilot.md
import * as os from "node:os";
import * as path from "node:path";
import { normalizeSkillName } from "../lib/normalizeSkillName.ts";
import type { HookResponse, ToolCall } from "../types.ts";
import {
	createNormalizedEvent,
	defaultExtractLatestMessage,
	extractToolCall,
	getGenericSkillDirs,
	resolveToolReadPath,
} from "./common.ts";
import type { EgressOutput, HarnessAdapter, NormalizedEvent } from "./types.ts";

export const copilotHarness: HarnessAdapter = {
	id: "copilot",

	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
		return Boolean(
			env.COPILOT_PLUGIN_DATA ||
				env.COPILOT_SESSION_ID ||
				(payload.timestamp !== undefined &&
					(payload.hook_event_name !== undefined ||
						payload.hookEventName !== undefined)),
		);
	},

	normalize(
		payload: Record<string, unknown>,
		modeArg?: string,
		env: NodeJS.ProcessEnv = process.env,
	): NormalizedEvent {
		const conversationId = String(
			payload.sessionId ??
				payload.session_id ??
				payload.conversationId ??
				"default",
		);
		const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
		const eventName = payload.hook_event_name ?? payload.hookEventName;

		const isTool =
			modeArg === "tool" ||
			eventName === "preToolUse" ||
			eventName === "PreToolUse";

		const isStop =
			!isTool &&
			(modeArg === "stop" ||
				eventName === "Stop" ||
				payload.stop_hook_active !== undefined ||
				payload.stopHookActive !== undefined);

		const type = isTool ? "tool" : isStop ? "stop" : "pre";

		const prompt =
			typeof payload.prompt === "string"
				? payload.prompt
				: typeof payload.initial_prompt === "string"
					? payload.initial_prompt
					: typeof payload.initialPrompt === "string"
						? payload.initialPrompt
						: undefined;

		const stopHookActive = Boolean(
			payload.stop_hook_active ?? payload.stopHookActive,
		);
		const toolCall = type === "tool" ? extractToolCall(payload) : null;
		const readTargetFilePath = toolCall
			? (this.extractFileReadTarget?.(toolCall, workspacePath) ?? null)
			: null;
		const skillTarget = toolCall
			? (this.extractSkillTarget?.(toolCall) ?? null)
			: null;
		const latestMessage = this.extractLatestMessage({
			type,
			prompt,
			rawPayload: payload,
		});

		return createNormalizedEvent({
			harness: "copilot",
			conversationId,
			workspacePath,
			type,
			rawPayload: payload,
			stopHookActive,
			toolCall,
			readTargetFilePath,
			skillTarget,
			latestMessage,
			prompt,
		});
	},

	extractFileReadTarget(
		toolCall: ToolCall,
		workspacePath: string,
	): string | null {
		if (toolCall.name !== "read_file" && toolCall.name !== "view_file") {
			return null;
		}
		return resolveToolReadPath(
			toolCall.args.path ?? toolCall.args.file_path,
			workspacePath,
		);
	},

	extractSkillTarget(toolCall: ToolCall): string | null {
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
	},

	extractLatestMessage: defaultExtractLatestMessage,

	formatEgress(event: NormalizedEvent, response: HookResponse): EgressOutput {
		if (event.type === "stop") {
			if (response.action === "continue") {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						decision: "block",
						reason: response.reason,
						hookSpecificOutput: {
							hookEventName: "Stop",
							decision: "block",
							reason: response.reason,
						},
					}),
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		if (event.type === "tool") {
			if (response.action === "deny") {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						permissionDecision: "deny",
						permissionDecisionReason: response.reason,
						hookSpecificOutput: {
							hookEventName: "PreToolUse",
							permissionDecision: "deny",
							permissionDecisionReason: response.reason,
						},
					}),
				};
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					permissionDecision: "allow",
					hookSpecificOutput: {
						hookEventName: "PreToolUse",
						permissionDecision: "allow",
					},
				}),
			};
		}

		if (event.type === "pre") {
			if (response.action === "inject") {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						additionalContext: response.message,
					}),
				};
			}
			return { exitCode: 0, stdout: "{}" };
		}

		return { exitCode: 0, stdout: "{}" };
	},

	resolveConversationId(env: NodeJS.ProcessEnv): string | null {
		return env.COPILOT_SESSION_ID || null;
	},

	resolveStorageDir(env: NodeJS.ProcessEnv): string | null {
		return env.COPILOT_PLUGIN_DATA || null;
	},

	getSkillDirs(
		workspacePath: string,
		env: NodeJS.ProcessEnv = process.env,
	): string[] {
		const home = env.HOME || os.homedir();
		return [
			...getGenericSkillDirs(workspacePath),
			path.join(workspacePath, ".github/skills"),
			path.join(workspacePath, ".claude/skills"),
			path.join(home, ".copilot/skills"),
			path.join(home, ".claude/skills"),
			path.join(home, ".agents/skills"),
		];
	},
};
