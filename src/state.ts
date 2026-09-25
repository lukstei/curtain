import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveStorageDirFromHarnesses } from "./harnesses/index.ts";
import { logDebug } from "./lib/logDebug.ts";
import type { Step } from "./parser.ts";

export interface RunnerState {
	script: string;
	status: "running" | "paused";
	currentStep: number;
	steps: Step[];
	skillName?: string;
}

export function getStorageBaseDir(
	env: NodeJS.ProcessEnv = process.env,
): string {
	return (
		resolveStorageDirFromHarnesses(env) || path.join(os.tmpdir(), "curtain")
	);
}

export function getStatePath(
	conversationId: string,
	env: NodeJS.ProcessEnv = process.env,
): string {
	assert(conversationId.trim().length > 0, "conversationId must not be empty");
	return path.join(
		getStorageBaseDir(env),
		conversationId,
		"curtain-state.json",
	);
}

export function getDebugLogPath(
	conversationId?: string,
	env: NodeJS.ProcessEnv = process.env,
): string {
	const base = getStorageBaseDir(env);
	return conversationId
		? path.join(base, conversationId, "debug.log")
		: path.join(base, "debug.log");
}

export function loadState(
	conversationId: string,
	env: NodeJS.ProcessEnv = process.env,
): RunnerState | null {
	const filePath = getStatePath(conversationId, env);
	if (!fs.existsSync(filePath)) return null;

	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const data = JSON.parse(raw);
		if (
			!data ||
			typeof data !== "object" ||
			typeof data.script !== "string" ||
			(data.status !== "running" && data.status !== "paused") ||
			typeof data.currentStep !== "number" ||
			!Array.isArray(data.steps)
		) {
			logDebug(`Corrupt state schema at ${filePath}`);
			return null;
		}
		return data as RunnerState;
	} catch (err) {
		const isEnoent = (err as NodeJS.ErrnoException).code === "ENOENT";
		if (!isEnoent) {
			logDebug(`Failed to read state file at ${filePath}`, err);
		}
		return null;
	}
}

export function saveState(
	conversationId: string,
	state: RunnerState,
	env: NodeJS.ProcessEnv = process.env,
): void {
	const filePath = getStatePath(conversationId, env);
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export function deleteState(
	conversationId: string,
	env: NodeJS.ProcessEnv = process.env,
): void {
	const filePath = getStatePath(conversationId, env);
	try {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	} catch (err) {
		const isEnoent = (err as NodeJS.ErrnoException).code === "ENOENT";
		if (!isEnoent) {
			logDebug(`Failed to delete state file at ${filePath}`, err);
		}
	}
}
