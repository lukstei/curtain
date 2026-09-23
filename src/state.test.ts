import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunnerState } from "./state.ts";
import { deleteState, getStatePath, loadState, saveState } from "./state.ts";

describe("state.ts", () => {
	const tmpDir = path.join(os.tmpdir(), `curtain-state-test-${Date.now()}`);
	const env = { AGY_PLUGIN_DATA: tmpDir };

	it("resolves state path inside harness storage directory", () => {
		const statePath = getStatePath("session-123", env);
		expect(statePath).toBe(
			path.join(tmpDir, "session-123", "curtain-state.json"),
		);
	});

	it("returns null when state file does not exist", () => {
		const state = loadState("non-existent-session", env);
		expect(state).toBeNull();
	});

	it("saves, loads, and deletes runner state", () => {
		const sessionId = "test-session-1";
		const sampleState: RunnerState = {
			script: "playbook.md",
			status: "running",
			currentStep: 0,
			totalSteps: 2,
			steps: [
				{ index: 0, type: "auto", content: "Step 1" },
				{ index: 1, type: "pause", content: "Step 2" },
			],
		};

		saveState(sessionId, sampleState, env);
		const loaded = loadState(sessionId, env);
		expect(loaded).toEqual(sampleState);

		deleteState(sessionId, env);
		expect(loadState(sessionId, env)).toBeNull();
	});
});
