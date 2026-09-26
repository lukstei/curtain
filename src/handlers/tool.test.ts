import assert from "node:assert/strict";
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
			skillName: path.basename(testDir),
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
			harness: "agy",
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: scriptFile,
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.action).toBe("deny");
		expect(result.response).toMatchInlineSnapshot(`
			{
			  "action": "deny",
			  "reason": "BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect PLAYBOOK.md.",
			}
		`);
	});

	it("denies reading custom active script file like SMELLS.md and dynamically formats reason", () => {
		const customFile = path.join(testDir, "SMELLS.md");
		fs.writeFileSync(customFile, "# Smells\n");
		const customState: RunnerState = {
			script: customFile,
			status: "running",
			currentStep: 0,
			steps: [{ index: 0, type: "auto", content: "Step 1" }],
		};

		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: customFile,
		};

		const result = handlePreTool(info, customState);
		expect(result.response).toMatchInlineSnapshot(`
			{
			  "action": "deny",
			  "reason": "BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect SMELLS.md.",
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
			harness: "agy",
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: skillFile,
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.action).toBe("allow");
	});

	it("allows when readTargetFilePath points to unrelated file", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: otherFile,
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.action).toBe("allow");
	});

	it("allows reading an unrelated PLAYBOOK.md located in another directory", () => {
		const unrelatedDir = path.join(testDir, "other-skill");
		fs.mkdirSync(unrelatedDir, { recursive: true });
		const unrelatedPlaybook = path.join(unrelatedDir, "PLAYBOOK.md");
		fs.writeFileSync(unrelatedPlaybook, "# Other Playbook\n");

		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: unrelatedPlaybook,
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.action).toBe("allow");
	});

	it("allows when readTargetFilePath is undefined (non-reading tool)", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: {
				name: "run_command",
				args: { CommandLine: "echo test" },
			},
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.action).toBe("allow");
	});

	it("allows when runner state is null", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: { name: "view_file", args: {} },
			readTargetFilePath: scriptFile,
		};

		const result = handlePreTool(info, null);
		expect(result.response.action).toBe("allow");
	});

	it("strictly denies skillTarget curtain:next", () => {
		const infoNext: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: { name: "Skill", args: { skill: "curtain:next" } },
			skillTarget: "curtain:next",
			readTargetFilePath: null,
		};

		const result = handlePreTool(infoNext, activeState);
		expect(result.response).toMatchInlineSnapshot(`
			{
			  "action": "deny",
			  "reason": "BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
			}
		`);
	});

	it("denies redundant active skill re-invocation when active", () => {
		const activeSkillName = path.basename(testDir);
		const infoActiveSkill: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: {
				name: "Skill",
				args: { skill: `test-plugin:${activeSkillName}` },
			},
			skillTarget: `test-plugin:${activeSkillName}`,
			readTargetFilePath: null,
		};

		expect(
			handlePreTool(infoActiveSkill, activeState).response,
		).toMatchInlineSnapshot(`
			{
			  "action": "deny",
			  "reason": "BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke the active skill via the Skill tool. Execute the active step instructions directly.",
			}
		`);
	});

	it("allows unrelated skill invocation even when active", () => {
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: {
				name: "Skill",
				args: { skill: "other-plugin:unrelated-tool" },
			},
			skillTarget: "other-plugin:unrelated-tool",
			readTargetFilePath: null,
		};

		const result = handlePreTool(info, activeState);
		expect(result.response.action).toBe("allow");
	});

	it("allows foreign namespaced next skill without collision", () => {
		const infoForeignNext: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: { name: "Skill", args: { skill: "other-plugin:next" } },
			skillTarget: "other-plugin:next",
			readTargetFilePath: null,
		};
		expect(handlePreTool(infoForeignNext, activeState).response.action).toBe(
			"allow",
		);
	});

	it("resumes execution when paused and view_file reads next SKILL.md", () => {
		const pausedState: RunnerState = {
			...activeState,
			status: "paused",
			currentStep: 0,
		};
		const nextSkillPath = path.join(testDir, ".agents/skills/next/SKILL.md");
		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: { name: "view_file", args: { AbsolutePath: nextSkillPath } },
			readTargetFilePath: nextSkillPath,
		};

		const result = handlePreTool(info, pausedState);
		expect(result.state?.status).toBe("running");
		expect(result.state?.currentStep).toBe(1);
		assert(result.response.action === "deny");
		expect(result.response.reason).toContain("Act 2");
	});

	it("launches playbook when state is null and view_file reads a skill SKILL.md", () => {
		const skillDir = path.join(testDir, ".agents/skills/my-playbook");
		fs.mkdirSync(skillDir, { recursive: true });
		const skillFile = path.join(skillDir, "SKILL.md");
		const playbookFile = path.join(skillDir, "PLAYBOOK.md");
		fs.writeFileSync(skillFile, "# Launcher\n");
		fs.writeFileSync(
			playbookFile,
			"# My Playbook\nAct 1 content\n> [!CURTAIN]\nAct 2 content\n",
		);

		const info: HookInfo = {
			type: "tool",
			conversationId: "c1",
			workspacePath: testDir,
			harness: "agy",
			toolCall: { name: "view_file", args: { AbsolutePath: skillFile } },
			readTargetFilePath: skillFile,
		};

		const result = handlePreTool(info, null);
		expect(result.state?.status).toBe("running");
		expect(result.state?.script).toBe(playbookFile);
		assert(result.response.action === "deny");
		expect(result.response.reason).toContain("Act 1 content");
	});
});
