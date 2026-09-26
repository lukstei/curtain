import assert from "node:assert/strict";
import { agyHarness } from "./agy.ts";
import { claudeHarness } from "./claude.ts";
import { codexHarness } from "./codex.ts";
import { copilotHarness } from "./copilot.ts";
import type { HarnessAdapter, HarnessType } from "./types.ts";

export * from "./common.ts";
export * from "./types.ts";
export { agyHarness, claudeHarness, codexHarness, copilotHarness };

export const HARNESSES: readonly HarnessAdapter[] = [
	copilotHarness,
	codexHarness,
	claudeHarness,
	agyHarness,
];

export function detectHarness(
	payload: Record<string, unknown> = {},
	env: NodeJS.ProcessEnv = process.env,
): HarnessType | null {
	for (const harness of HARNESSES) {
		if (harness.detect(payload, env)) {
			return harness.id;
		}
	}

	return null;
}

export function getHarness(type: HarnessType): HarnessAdapter {
	const harness = HARNESSES.find((h) => h.id === type);
	assert(harness, `Unknown harness type: ${type}`);
	return harness;
}

export function resolveConversationIdFromHarnesses(
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	return (
		env.COPILOT_SESSION_ID ||
		env.CODEX_SESSION_ID ||
		env.CLAUDE_CODE_SESSION_ID ||
		env.ANTIGRAVITY_CONVERSATION_ID ||
		null
	);
}

export function resolveStorageDirFromHarnesses(
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	return (
		env.COPILOT_PLUGIN_DATA ||
		env.PLUGIN_DATA ||
		env.CLAUDE_PLUGIN_DATA ||
		env.AGY_PLUGIN_DATA ||
		null
	);
}
