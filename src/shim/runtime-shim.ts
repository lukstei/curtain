import { handle } from "../handlers/index.ts";
import { detectHarness, getHarness } from "../harnesses/index.ts";
import type { EgressOutput } from "../harnesses/types.ts";
import { logDebug } from "../lib/logDebug.ts";
import { loadState } from "../state.ts";
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

	const hookInfo: HookInfo = {
		type: event.type === "stop" ? "stop" : "pre",
		conversationId: event.conversationId,
		workspacePath: event.workspacePath,
		prompt: event.prompt,
		terminationReason: event.terminationReason,
		latestMessage: event.latestMessage,
	};

	const state = loadState(event.conversationId, env);
	const { response } = handle(hookInfo, state, env);

	return adapter.formatEgress(event, response);
}
