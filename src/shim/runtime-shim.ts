import { handle } from "../handlers/index.ts";
import { detectHarness, getHarness } from "../harnesses/index.ts";
import type { EgressOutput } from "../harnesses/types.ts";
import { logDebug } from "../lib/logDebug.ts";
import { logHookInvocation } from "../lib/logHook.ts";
import { deleteState, loadState, saveState } from "../state.ts";
import type { HookInfo, LatestMessage } from "../types.ts";
import { parseJsonSafe, readStdin } from "./stdin.ts";

export interface ShimTestOptions {
	latestMessage?: LatestMessage | null;
}

export function executeHook(
	modeArg: string,
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
	const event = adapter.normalize(payload, modeArg, env);

	logDebug.conversationId = event.conversationId;

	const base = {
		conversationId: event.conversationId,
		workspacePath: event.workspacePath,
		harness: event.harness,
	};

	const hookInfo: HookInfo =
		event.type === "pre"
			? {
					...base,
					type: "pre",
					prompt: event.prompt,
					...(event.skillInvocationPath
						? { skillInvocationPath: event.skillInvocationPath }
						: {}),
				}
			: event.type === "stop"
				? {
						...base,
						type: "stop",
						terminationReason: event.terminationReason,
					}
				: {
						...base,
						type: "tool",
						toolCall: event.toolCall,
						readTargetFilePath: event.readTargetFilePath,
						skillTarget: event.skillTarget,
					};

	const state = loadState(event.conversationId, env);
	const { state: nextState, response } = handle(hookInfo, state);

	if (nextState === null) {
		if (state !== null) {
			deleteState(event.conversationId, env);
		}
	} else if (nextState !== state) {
		saveState(event.conversationId, nextState, env);
	}

	const egress = adapter.formatEgress(event, response);

	const isDebug = Boolean(env.CURTAIN_DEBUG ?? process.env.CURTAIN_DEBUG);
	if (isDebug) {
		const latestMessage = "latestMessage" in event ? event.latestMessage : null;
		logHookInvocation(
			event.conversationId,
			{
				timestamp: new Date().toISOString(),
				hook: modeArg,
				input: rawInput,
				output: egress.stdout ?? "{}",
				...(latestMessage ? { latestMessage } : {}),
				state: {...nextState||{}, ...{steps: undefined}},
			},
			env,
		);
	}

	return egress;
}

export async function runShim(
	modeArg: string,
	env = process.env,
): Promise<EgressOutput> {
	const input = await readStdin();
	const payload = parseJsonSafe(input);
	return executeHook(modeArg, payload, input, env);
}

export async function runShimForTest(
	modeArg: string,
	rawInput: string,
	env = process.env,
	options?: ShimTestOptions,
): Promise<EgressOutput> {
	const payload = parseJsonSafe(rawInput);
	if (options?.latestMessage !== undefined) {
		payload.latestMessage = options.latestMessage;
	}
	return executeHook(modeArg, payload, rawInput, env);
}
