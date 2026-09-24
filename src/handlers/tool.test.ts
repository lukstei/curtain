import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunnerState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { handlePreTool } from "./tool.ts";

describe("handlers/tool.ts", () => {
	let testDir: string;
	let scriptFile: string;
	let otherFile: string;
	let activeState: RunnerState;

	beforeEach(() => {
		testDir = path.join(os.tmpdir(), `curtain-tool-test-${Date.now()}`);
		fs.mkdirSync(testDir, { recursive: true });

		scriptFile = path.join(testDir, "PLAYBOOK.md");
		fs.writeFileSync(
			scriptFile,
			"# Playbook\nAct 1\n> [!CURTAIN]\nAct 2\n",
			"utf-8",
		);

		otherFile = path.join(testDir, "README.md");
		fs.writeFileSync(otherFile, "# Readme\n", "utf-8");

		activeState = {
			script: scriptFile,
			status: "running",
			currentStep: 0,
			steps: [
				{ index: 0, type: "auto", content: "Act 1" },
				{ index: 1, type: "auto", content: "Act 2" },
			],
		};
	});

	afterEach(() => {
		fs.rmSync(testDir, { recursive: true, force: true });
	});

	it("denies when readTargetFilePath matches active script", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: scriptFile,
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.decision).toBe("deny");
		expect(result.response).toMatchInlineSnapshot(`
			{
			  "decision": "deny",
			  "reason": "BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect PLAYBOOK.md.",
			}
		`);
	});

	it("allows when readTargetFilePath points to SKILL.md", () => {
		const skillFile = path.join(testDir, "SKILL.md");
		fs.writeFileSync(skillFile, "# Skill Launcher\n");
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: skillFile,
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.decision).toBe("allow");
	});

	it("allows when readTargetFilePath points to unrelated file", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: otherFile,
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.decision).toBe("allow");
	});

	it("allows when readTargetFilePath is undefined (non-reading tool)", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			toolCall: {
				name: "run_command",
				args: { CommandLine: "echo test" },
			},
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.decision).toBe("allow");
	});

	it("allows when runner state is null", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: scriptFile,
		};

		const result = handlePreTool(info, null);
		expect(result.response.decision).toBe("allow");
	});
});
