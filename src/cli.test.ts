import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCliArgs, runCli } from "./cli.ts";
import { loadState, saveState } from "./state.ts";

function createIo() {
	const out: string[] = [];
	const err: string[] = [];
	return {
		io: {
			writeOut: (msg: string) => out.push(msg),
			writeErr: (msg: string) => err.push(msg),
		},
		getOut: () => out.join("\n"),
		getErr: () => err.join("\n"),
	};
}

describe("cli.ts", () => {
	const tmpDir = path.join(os.tmpdir(), `curtain-cli-test-${Date.now()}`);
	const env = {
		AGY_PLUGIN_DATA: tmpDir,
		ANTIGRAVITY_CONVERSATION_ID: "cli-test-session",
	};

	it("parses CLI args correctly", () => {
		expect(parseCliArgs(["start", "playbook.md"])).toEqual({
			command: "start",
			subcommand: "playbook.md",
			args: ["playbook.md"],
			options: {},
		});
		expect(parseCliArgs(["next"])).toEqual({
			command: "next",
			subcommand: undefined,
			args: [],
			options: {},
		});
		expect(parseCliArgs(["-h"])).toEqual({
			command: undefined,
			subcommand: undefined,
			args: [],
			options: { help: true },
		});
	});

	it("displays help output", async () => {
		const { io, getOut } = createIo();
		const res = await runCli(["--help"], io, env);
		expect(res.exitCode).toBe(0);
		expect(getOut()).toContain(
			"curtain - Minimal Multi-Act Instruction Runner",
		);
	});

	it("reports status when idle", async () => {
		const { io, getOut } = createIo();
		const res = await runCli(["status"], io, env);
		expect(res.exitCode).toBe(0);
		expect(getOut()).toBe("[CURTAIN STATUS] No active script running.");
	});

	it("runs playbook, checks status, raises curtain, and drops", async () => {
		const fixturePath = path.join(tmpDir, "test.md");
		fs.mkdirSync(tmpDir, { recursive: true });
		fs.writeFileSync(
			fixturePath,
			["Step 1 content", "> [!CURTAIN]", "Step 2 content"].join("\n"),
		);

		// 1. Start execution
		const ioStart = createIo();
		const resStart = await runCli(["start", fixturePath], ioStart.io, env);
		expect(resStart.exitCode).toBe(0);
		expect(ioStart.getOut()).toContain("[STEP 1 OF 2]");

		// 2. Check status
		const ioStatus = createIo();
		await runCli(["status"], ioStatus.io, env);
		expect(ioStatus.getOut()).toContain("Step 1/2 | State: running");

		// 3. Drop execution
		const ioDrop = createIo();
		const resDrop = await runCli(["drop"], ioDrop.io, env);
		expect(resDrop.exitCode).toBe(0);
		expect(ioDrop.getOut()).toBe("[CURTAIN DROPPED] Execution stopped.");

		// 4. Verify status is idle again
		const ioStatusAfter = createIo();
		await runCli(["status"], ioStatusAfter.io, env);
		expect(ioStatusAfter.getOut()).toBe(
			"[CURTAIN STATUS] No active script running.",
		);
	});

	it("completes execution when curtain next is run on final step intermission", async () => {
		const scriptPath = path.join(tmpDir, "single-pause.md");
		fs.writeFileSync(
			scriptPath,
			["Step 1 content", "> [!INTERMISSION] Review carefully"].join("\n"),
		);

		const conversationId = "cli-test-final-pause";
		const testEnv = {
			...env,
			ANTIGRAVITY_CONVERSATION_ID: conversationId,
		};

		// 1. Start execution
		const ioStart = createIo();
		await runCli([scriptPath], ioStart.io, testEnv);

		// Manually transition to paused as stop hook would
		const state = loadState(conversationId, testEnv);
		expect(state).not.toBeNull();
		if (state) {
			saveState(conversationId, { ...state, status: "paused" }, testEnv);
		}

		// 2. Advance curtain on final step
		const ioNext = createIo();
		const resNext = await runCli(["next"], ioNext.io, testEnv);
		expect(resNext.exitCode).toBe(0);
		expect(resNext.output).toBe("[CURTAIN STATUS] Execution complete.");

		// 3. Verify state is deleted
		expect(loadState(conversationId, testEnv)).toBeNull();
	});
});
