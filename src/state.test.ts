import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as logDebugModule from "./lib/logDebug.ts";
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

	it("saves and loads runner state with optional skillName", () => {
		const sessionId = "test-session-skill";
		const sampleState: RunnerState = {
			script: "playbook.md",
			status: "running",
			currentStep: 0,
			steps: [{ index: 0, type: "auto", content: "Step 1" }],
			skillName: "curtain-skill",
		};

		saveState(sessionId, sampleState, env);
		const loaded = loadState(sessionId, env);
		expect(loaded).toEqual(sampleState);

		deleteState(sessionId, env);
	});

	it("returns null and logs when state file contains invalid JSON", () => {
		const sessionId = "test-session-corrupt";
		const statePath = getStatePath(sessionId, env);
		fs.mkdirSync(path.dirname(statePath), { recursive: true });
		fs.writeFileSync(statePath, "{ broken json ...", "utf-8");

		const spy = vi.spyOn(logDebugModule, "logDebug");
		const loaded = loadState(sessionId, env);
		expect(loaded).toBeNull();
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("Failed to read state file"),
			expect.anything(),
		);
		spy.mockRestore();
	});

	it("returns null and logs when state file has invalid schema", () => {
		const sessionId = "test-session-invalid-schema";
		const statePath = getStatePath(sessionId, env);
		fs.mkdirSync(path.dirname(statePath), { recursive: true });
		fs.writeFileSync(statePath, JSON.stringify({ notAState: true }), "utf-8");

		const spy = vi.spyOn(logDebugModule, "logDebug");
		const loaded = loadState(sessionId, env);
		expect(loaded).toBeNull();
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("Corrupt state schema"),
		);
		spy.mockRestore();
	});

	it("returns null and logs when state file has corrupt step schema", () => {
		const sessionId = "test-session-corrupt-step";
		const statePath = getStatePath(sessionId, env);
		fs.mkdirSync(path.dirname(statePath), { recursive: true });
		fs.writeFileSync(
			statePath,
			JSON.stringify({
				script: "playbook.md",
				status: "running",
				currentStep: 0,
				steps: [{ index: 0, type: "invalid-type", content: 123 }],
			}),
			"utf-8",
		);

		const spy = vi.spyOn(logDebugModule, "logDebug");
		const loaded = loadState(sessionId, env);
		expect(loaded).toBeNull();
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("Corrupt state schema"),
		);
		spy.mockRestore();
	});
});
