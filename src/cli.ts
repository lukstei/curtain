import { parseArgs } from "node:util";
import { resolveConversationIdFromHarnesses } from "./harnesses/index.ts";
import { loadScript } from "./resolver.ts";
import { runShim } from "./shim/runtime-shim.ts";
import { deleteState, loadState, saveState } from "./state.ts";
import {
	formatStatus,
	formatStepPrompt,
	resumeExecution,
	startExecution,
} from "./transitions.ts";

export interface ParsedCli {
	command?: string;
	subcommand?: string;
	args: string[];
	options: {
		help?: boolean;
		version?: boolean;
		[key: string]: unknown;
	};
}

export function getCliHelp(): string {
	return [
		"curtain - Minimal Multi-Act Instruction Runner for AI Agents",
		"",
		"Usage:",
		"  curtain <file.md>        Start execution of a multi-act script",
		"  curtain start <file.md>  Start execution of a multi-act script",
		"  curtain raise            Advance to next step when paused at a curtain",
		"  curtain drop             Stop execution and reset state",
		"  curtain status           Display current step and runner status",
		"  curtain hook <event>     Execute harness lifecycle hook (pre, stop)",
		"  curtain help             Show this help reference",
		"",
		"Options:",
		"  -h, --help               Show help",
		"  -v, --version            Show version",
	].join("\n");
}

export function parseCliArgs(
	args: string[] = process.argv.slice(2),
): ParsedCli {
	const { values, positionals } = parseArgs({
		args,
		options: {
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
		allowPositionals: true,
		strict: false,
	});

	return {
		command: positionals[0],
		subcommand: positionals[1],
		args: positionals.slice(1),
		options: values as ParsedCli["options"],
	};
}

export interface CliIo {
	writeOut: (msg: string) => void;
	writeErr: (msg: string) => void;
}

const defaultIo: CliIo = {
	writeOut: (msg: string) => console.log(msg),
	writeErr: (msg: string) => console.error(msg),
};

export async function runCli(
	args: string[] = process.argv.slice(2),
	io: CliIo = defaultIo,
	env: NodeJS.ProcessEnv = process.env,
): Promise<{ exitCode: number; output?: string }> {
	const parsed = parseCliArgs(args);
	const { writeOut, writeErr } = io;

	if (parsed.options.help || parsed.command === "help") {
		const helpText = getCliHelp();
		writeOut(helpText);
		return { exitCode: 0, output: helpText };
	}

	if (parsed.options.version || parsed.command === "version") {
		const version = "0.2.0";
		writeOut(version);
		return { exitCode: 0, output: version };
	}

	if (parsed.command === "hook") {
		const modeArg = parsed.subcommand ?? "stop";
		const egress = await runShim(modeArg, undefined, env);
		if (egress.stdout) writeOut(egress.stdout);
		if (egress.stderr) writeErr(egress.stderr);
		return { exitCode: egress.exitCode, output: egress.stdout };
	}

	const conversationId = resolveConversationIdFromHarnesses(env) ?? "default";
	const cwd = env.PWD || process.cwd();

	if (
		parsed.command === "drop" ||
		parsed.command === "stop" ||
		parsed.command === "abort"
	) {
		deleteState(conversationId, env);
		const msg = "[CURTAIN DROPPED] Execution stopped.";
		writeOut(msg);
		return { exitCode: 0, output: msg };
	}

	if (parsed.command === "status") {
		const state = loadState(conversationId, env);
		const msg = formatStatus(state);
		writeOut(msg);
		return { exitCode: 0, output: msg };
	}

	if (parsed.command === "raise" || parsed.command === "next") {
		const state = loadState(conversationId, env);
		if (!state) {
			const err =
				"No script is currently loaded. Start with 'curtain <script.md>'.";
			writeErr(err);
			return { exitCode: 1, output: err };
		}

		const res = resumeExecution(state);
		if (res.action === "error") {
			writeErr(res.error);
			return { exitCode: 1, output: res.error };
		}

		if (res.action === "finish") {
			deleteState(conversationId, env);
			const msg = "[CURTAIN STATUS] Execution complete.";
			writeOut(msg);
			return { exitCode: 0, output: msg };
		}

		saveState(conversationId, res.state, env);
		const msg = formatStepPrompt(res.step, res.state.totalSteps);
		writeOut(msg);
		return { exitCode: 0, output: msg };
	}

	// Check for start / run or direct file argument
	const isStartCommand = parsed.command === "start" || parsed.command === "run";
	const filePathCandidate = isStartCommand ? parsed.args[0] : parsed.command;

	if (filePathCandidate) {
		const loaded = loadScript(filePathCandidate, [cwd]);
		if (!loaded || "error" in loaded) {
			const err = !loaded
				? `Script file not found: "${filePathCandidate}"`
				: loaded.error;
			writeErr(err);
			return { exitCode: 1, output: err };
		}

		const nextState = startExecution(loaded.script);
		saveState(conversationId, nextState, env);
		const firstStep = nextState.steps[0];
		const msg = formatStepPrompt(firstStep, nextState.totalSteps);
		writeOut(msg);
		return { exitCode: 0, output: msg };
	}

	const helpText = getCliHelp();
	writeOut(helpText);
	return { exitCode: 0, output: helpText };
}

const isDirectExecution =
	Boolean(process.argv[1]?.endsWith("curtain.cjs")) ||
	Boolean(process.argv[1]?.endsWith("cli.ts"));

if (isDirectExecution && !process.env.VITEST) {
	runCli().then((res) => {
		if (res.exitCode !== 0) {
			process.exit(res.exitCode);
		}
	});
}
