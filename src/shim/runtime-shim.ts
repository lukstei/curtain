import { detectHarness, getHarness } from "../harnesses/index.ts";
import type { EgressOutput } from "../harnesses/types.ts";
import { logDebug } from "../lib/logDebug.ts";
import { logHookInvocation } from "../lib/logHook.ts";
import { deleteState, loadState, saveState } from "../state.ts";
import type { HookMode } from "../types.ts";
import { parseJsonSafe, readStdin } from "./stdin.ts";

export interface ShimTestOptions {
	prompt?: string;
	skillInvocationPath?: string;
}

export function executeHook(
	mode: HookMode,
	payload: Record<string, unknown>,
	rawInput: string,
	env = process.env,
): EgressOutput {
	const harnessId = detectHarness(payload, env);
	// edge case: invocation without recognized harness signatures exits cleanly with 0
	if (!harnessId) {
		return { exitCode: 0 };
	}

	const adapter = getHarness(harnessId);
	const conversationId = adapter.resolveConversationId(payload, env);

	logDebug.conversationId = conversationId;

	const state = loadState(conversationId, env);
	const { egress, nextState } = adapter.handle(payload, {
		conversationId,
		state,
		mode,
		env,
	});

	if (nextState === null) {
		if (state !== null) {
			deleteState(conversationId, env);
		}
	} else if (nextState !== state) {
		saveState(conversationId, nextState, env);
	}

	const isDebug = Boolean(env.CURTAIN_DEBUG ?? process.env.CURTAIN_DEBUG);
	if (isDebug) {
		const loggedState = nextState
			? (({ steps, ...rest }) => rest)(nextState)
			: null;
		logHookInvocation(
			conversationId,
			{
				timestamp: new Date().toISOString(),
				hook: mode,
				input: rawInput,
				output: egress.stdout ?? "{}",
				state: loggedState,
			},
			env,
		);
	}

	return egress;
}

export async function runShim(
	mode: HookMode,
	env = process.env,
): Promise<EgressOutput> {
	const input = await readStdin();
	const payload = parseJsonSafe(input);
	return executeHook(mode, payload, input, env);
}

export async function runShimForTest(
	mode: HookMode,
	rawInput: string,
	env = process.env,
	options?: ShimTestOptions,
): Promise<EgressOutput> {
	const payload = parseJsonSafe(rawInput);
	if (options?.prompt !== undefined) {
		payload.prompt = options.prompt;
	}
	if (options?.skillInvocationPath !== undefined) {
		payload.skillInvocationPath = options.skillInvocationPath;
	}
	return executeHook(mode, payload, rawInput, env);
}
