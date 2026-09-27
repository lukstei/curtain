import type { RunnerState } from "../state.ts";
import type { HookMode } from "../types.ts";

export type HarnessType = "claude" | "codex" | "agy" | "copilot";

export interface EgressOutput {
	stdout?: string;
	stderr?: string;
	exitCode: number;
}

export interface HarnessContext {
	conversationId: string;
	state: RunnerState | null;
	mode: HookMode;
	env: NodeJS.ProcessEnv;
}

export interface HarnessResult {
	egress: EgressOutput;
	nextState: RunnerState | null;
}

export interface HarnessAdapter {
	id: HarnessType;
	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean;
	resolveConversationId(
		payload: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
	): string;
	handle(payload: Record<string, unknown>, ctx: HarnessContext): HarnessResult;
	getSkillDirs(workspacePaths: string[]): string[];
}
