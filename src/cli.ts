import { parseArgs } from "node:util";
import { runShim } from "./shim/runtime-shim.ts";
import { getVersion } from "./version.ts";

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
		"  curtain hook <event>     Execute harness lifecycle hook (pre, tool, stop)",
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

	if (parsed.options.version || parsed.command === "version") {
		const version = getVersion();
		writeOut(version);
		return { exitCode: 0, output: version };
	}

	if (parsed.options.help || parsed.command === "help" || !parsed.command) {
		const helpText = getCliHelp();
		writeOut(helpText);
		return { exitCode: 0, output: helpText };
	}

	if (parsed.command === "hook") {
		const modeArg = parsed.subcommand ?? "stop";
		const egress = await runShim(modeArg, undefined, env);
		if (egress.stdout) writeOut(egress.stdout);
		if (egress.stderr) writeErr(egress.stderr);
		return { exitCode: egress.exitCode, output: egress.stdout };
	}

	const err = `Unknown command "${parsed.command}". Curtain is an agent lifecycle hook plugin. In chat, start a workflow with /<skill-name> and advance with /next.`;
	writeErr(err);
	return { exitCode: 1, output: err };
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
