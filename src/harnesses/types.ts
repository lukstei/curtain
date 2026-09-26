import type { RunnerState } from "../state.ts";
import type { HookMode } from "../types.ts";

export type HarnessType = "claude" | "codex" | "agy" | "copilot";

export interface EgressOutput {
	stdout?: string;
	stderr?: string;
	exitCode: number;
}

export interface HarnessContext {
	readonly conversationId: string;
	readonly state: RunnerState | null;
	readonly mode: HookMode;
	readonly env: NodeJS.ProcessEnv;
}

export interface HarnessResult {
	readonly egress: EgressOutput;
	readonly nextState: RunnerState | null;
}

export interface HarnessAdapter {
	readonly id: HarnessType;
	detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean;
	resolveConversationId(
		payload: Record<string, unknown>,
		env: NodeJS.ProcessEnv,
	): string;
	handle(payload: Record<string, unknown>, ctx: HarnessContext): HarnessResult;
	getSkillDirs(workspacePaths: readonly string[]): string[];
}
