import { handle } from "../handlers/index.ts";
import { detectHarness, getHarness } from "../harnesses/index.ts";
import type { EgressOutput } from "../harnesses/types.ts";
import { logDebug } from "../lib/logDebug.ts";
import { deleteState, loadState, saveState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { parseJsonSafe, readStdin } from "./stdin.ts";

export async function runShim(
	modeArg: string,
	rawInput?: string,
	env = process.env,
): Promise<EgressOutput> {
	const input = rawInput !== undefined ? rawInput : await readStdin();
	const payload = parseJsonSafe(input);

	const harnessId = detectHarness(payload, env);
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

	return adapter.formatEgress(event, response);
}
