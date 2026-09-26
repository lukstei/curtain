import { describe, expect, it } from "vitest";
import { parseCliArgs, runCli } from "./cli.ts";

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
	it("parses CLI args correctly", () => {
		expect(parseCliArgs(["hook", "pre"])).toEqual({
			command: "hook",
			subcommand: "pre",
			args: ["pre"],
			options: {},
		});
		expect(parseCliArgs(["hook", "stop"])).toEqual({
			command: "hook",
			subcommand: "stop",
			args: ["stop"],
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
		const res = await runCli(["--help"], io);
		expect(res.exitCode).toBe(0);
		expect(getOut()).toContain(
			"curtain - Minimal Multi-Act Instruction Runner",
		);
		expect(getOut()).toContain("curtain hook <event>");
	});

	it("displays version output matching package.json", async () => {
		const { io, getOut } = createIo();
		const res = await runCli(["--version"], io);
		expect(res.exitCode).toBe(0);
		expect(getOut().trim()).toBe("0.1.3");
	});

	it("returns error on legacy or unknown command", async () => {
		const { io, getErr } = createIo();
		const resNext = await runCli(["next"], io);
		expect(resNext.exitCode).toBe(1);
		expect(getErr()).toContain('Unknown command "next"');

		const resStart = await runCli(["start", "playbook.md"], io);
		expect(resStart.exitCode).toBe(1);
		expect(getErr()).toContain('Unknown command "start"');
	});
});
