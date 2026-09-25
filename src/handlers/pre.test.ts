import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunnerState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { handlePre } from "./pre.ts";

describe("handlers/pre.ts", () => {
	const tmpDir = path.join(os.tmpdir(), `curtain-pre-test-${Date.now()}`);

	const sampleState: RunnerState = {
		script: "sample.md",
		status: "paused",
		currentStep: 0,
		steps: [
			{
				index: 0,
				type: "pause",
				content: "Step 1 content",
				instruction: "Check table schema",
			},
			{ index: 1, type: "auto", content: "Step 2 content" },
		],
	};

	it("resumes execution when user sends /next", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c1",
			workspacePath: "/test",
			prompt: "/next",
		};

		const { state, response } = handlePre(info, sampleState);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(1);
		expect(response).toMatchInlineSnapshot(`
			{
			  "action": "inject",
			  "message": "[STEP 2 OF 2]

			Step 2 content

			Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
			}
		`);
	});

	it("resumes execution when user invokes /next via skill link in Codex", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c1-codex",
			workspacePath: "/test",
			prompt: "[$next](/path/to/skills/next/SKILL.md) \n",
			skillInvocationPath: "/path/to/skills/next/SKILL.md",
		};

		const { state, response } = handlePre(info, sampleState);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(1);
		expect(response).toMatchInlineSnapshot(`
			{
			  "action": "inject",
			  "message": "[STEP 2 OF 2]

			Step 2 content

			Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
			}
		`);
	});

	it("resumes execution when user sends [$next] without path", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c1-bare-link",
			workspacePath: "/test",
			prompt: "[$next]",
		};

		const { state } = handlePre(info, sampleState);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(1);
	});

	it("remains paused when user enters plain next without slash or brackets", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c1-plain-next",
			workspacePath: "/test",
			prompt: "next",
		};

		const { state, response } = handlePre(info, sampleState);
		expect(state?.status).toBe("paused");
		expect(state?.currentStep).toBe(0);
		expect(response.action === "inject" && response.message).toContain(
			"Execution is PAUSED at an intermission",
		);
	});

	it("completes execution when user sends /next on final step intermission", () => {
		const singleStepPausedState: RunnerState = {
			script: "sample.md",
			status: "paused",
			currentStep: 0,
			steps: [
				{
					index: 0,
					type: "pause",
					content: "Step 1 content",
					instruction: "Check table schema",
				},
			],
		};
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c1-final",
			workspacePath: "/test",
			prompt: "/next",
		};

		const { state, response } = handlePre(info, singleStepPausedState);
		expect(state).toBeNull();
		expect(response).toMatchInlineSnapshot(`
			{
			  "action": "inject",
			  "message": "Execution complete.",
			}
		`);
	});

	it("replays intermission review instruction on normal user message while paused", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c4-review",
			workspacePath: "/test",
			prompt: "I have added the missing migration column",
		};

		const { state, response } = handlePre(info, sampleState);
		expect(state).toEqual(sampleState);
		expect(response).toMatchInlineSnapshot(`
			{
			  "action": "inject",
			  "message": "[INTERMISSION REVIEW]

			Check table schema

			Execution is PAUSED at an intermission for human review.

			- Follow and execute all instructions, adjustments, or questions given by the user in their prompt.

			- Present your completed work or findings clearly for the user to review, using the review sidebar artifact if applicable.

			- Do NOT execute, advance to, or anticipate any DOWNSTREAM or FUTURE steps from the playbook script.

			- Remind the user that execution remains paused at this intermission and only typing /next will advance to the next playbook step.",
			}
		`);
	});

	it("replays intermission review reminder when paused without intermission instruction", () => {
		const stateWithoutInstruction: RunnerState = {
			...sampleState,
			steps: [
				{ index: 0, type: "pause", content: "Step 1 content" },
				{ index: 1, type: "auto", content: "Step 2 content" },
			],
		};
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c4-no-inst",
			workspacePath: "/test",
			prompt: "Please check this specific edge case first",
		};

		const { state, response } = handlePre(info, stateWithoutInstruction);
		expect(state).toEqual(stateWithoutInstruction);
		expect(response).toMatchInlineSnapshot(`
			{
			  "action": "inject",
			  "message": "[INTERMISSION REVIEW]

			Execution is PAUSED at an intermission for human review.

			- Follow and execute all instructions, adjustments, or questions given by the user in their prompt.

			- Present your completed work or findings clearly for the user to review, using the review sidebar artifact if applicable.

			- Do NOT execute, advance to, or anticipate any DOWNSTREAM or FUTURE steps from the playbook script.

			- Remind the user that execution remains paused at this intermission and only typing /next will advance to the next playbook step.",
			}
		`);
	});

	it("starts script on /curtain <file>", () => {
		const scriptPath = path.join(tmpDir, "PLAYBOOK.md");
		fs.mkdirSync(tmpDir, { recursive: true });
		fs.writeFileSync(
			scriptPath,
			["Step 1 instruction", "> [!CURTAIN]", "Step 2 instruction"].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c5",
			workspacePath: tmpDir,
			prompt: `/curtain ${scriptPath}`,
		};

		const { state, response } = handlePre(info, null);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(0);
		expect(response.action === "inject" && response.message).toContain(
			"[STEP 1 OF 2]",
		);
	});

	it("starts script on direct custom file invocation /curtain SMELLS.md", () => {
		const smellsPath = path.join(tmpDir, "SMELLS.md");
		fs.writeFileSync(
			smellsPath,
			["Phase 1", "> [!INTERMISSION] Review 1", "Phase 2"].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-smells-direct",
			workspacePath: tmpDir,
			prompt: "/curtain SMELLS.md",
		};

		const { state, response } = handlePre(info, null);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(0);
		expect(state?.script).toBe(smellsPath);
		expect(response.action === "inject" && response.message).toContain(
			"[STEP 1 OF 2]",
		);
		expect(response.action === "inject" && response.message).toContain(
			"Phase 1",
		);
	});

	it("implicitly starts execution when user invokes an annotated skill via slash command", () => {
		const skillDir = path.join(tmpDir, ".agents/skills/deploy-skill");
		fs.mkdirSync(skillDir, { recursive: true });
		fs.writeFileSync(
			path.join(skillDir, "SKILL.md"),
			[
				"---",
				"name: deploy-skill",
				"description: Deploy procedure",
				"---",
				"/curtain deploy-skill",
			].join("\n"),
		);
		const playbookFile = path.join(skillDir, "PLAYBOOK.md");
		fs.writeFileSync(
			playbookFile,
			[
				"# Deploy",
				"Step 1: Check environment",
				"> [!CURTAIN]",
				"Step 2: Deploy",
			].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-skill-implicit",
			workspacePath: tmpDir,
			harness: "agy",
			prompt: "/deploy-skill",
		};

		const { state, response } = handlePre(info, null);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(0);
		expect(state?.steps.length).toBe(2);
		expect(state?.script).toBe(playbookFile);
		expect(response.action === "inject" && response.message).toContain(
			"[STEP 1 OF 2]",
		);
		expect(response.action === "inject" && response.message).toContain(
			"Step 1: Check environment",
		);
		expect(response.action === "inject" && response.message).toContain(
			"Perform ONLY this step. Conclude when complete.",
		);
	});

	it("starts execution when skillInvocationPath is provided", () => {
		const skillDir = path.join(tmpDir, ".agents/skills/invoked-skill");
		fs.mkdirSync(skillDir, { recursive: true });
		const skillFile = path.join(skillDir, "SKILL.md");
		fs.writeFileSync(
			skillFile,
			[
				"---",
				"name: invoked-skill",
				"description: Invoked skill with curtains",
				"---",
				"/curtain invoked-skill",
			].join("\n"),
		);
		const playbookFile = path.join(skillDir, "PLAYBOOK.md");
		fs.writeFileSync(
			playbookFile,
			[
				"# Invoked Skill",
				"Step 1: Inspect environment",
				"> [!INTERMISSION]",
				"Step 2: Complete workflow",
			].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-skill-invoked",
			workspacePath: tmpDir,
			harness: "agy",
			prompt: "/invoked-skill",
			skillInvocationPath: skillFile,
		};

		const { state, response } = handlePre(info, null);
		expect(state?.status).toBe("running");
		expect(state?.script).toBe(playbookFile);
		expect(response.action === "inject" && response.message).toContain(
			"Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
		);
	});

	it("starts execution when skillInvocationPath is provided even if prompt and userInput are empty", () => {
		const skillDir = path.join(tmpDir, ".agents/skills/invoked-empty-prompt");
		fs.mkdirSync(skillDir, { recursive: true });
		const skillFile = path.join(skillDir, "SKILL.md");
		fs.writeFileSync(
			skillFile,
			[
				"---",
				"name: invoked-empty-prompt",
				"description: Invoked skill with empty prompt",
				"---",
				"/curtain invoked-empty-prompt",
			].join("\n"),
		);
		const playbookFile = path.join(skillDir, "PLAYBOOK.md");
		fs.writeFileSync(
			playbookFile,
			[
				"# Invoked Skill",
				"Step 1: Inspect environment",
				"> [!INTERMISSION]",
				"Step 2: Complete workflow",
			].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-skill-invoked-empty",
			workspacePath: tmpDir,
			harness: "agy",
			prompt: "",
			skillInvocationPath: skillFile,
		};

		const { state, response } = handlePre(info, null);
		expect(state?.status).toBe("running");
		expect(state?.script).toBe(playbookFile);
		expect(response.action === "inject" && response.message).toBeDefined();
	});

	it("does not start execution if invoked skill has only 1 step despite mentioning delimiter in code block", () => {
		const skillDir = path.join(tmpDir, ".agents/skills/doc-skill");
		fs.mkdirSync(skillDir, { recursive: true });
		fs.writeFileSync(
			path.join(skillDir, "SKILL.md"),
			[
				"---",
				"name: doc-skill",
				"description: Documentation with code example",
				"---",
				"# Curtain Guide",
				"Here is an example:",
				"```markdown",
				"> [!CURTAIN]",
				"```",
			].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-skill-doc",
			workspacePath: tmpDir,
			harness: "agy",
			prompt: "/doc-skill",
		};

		const { state, response } = handlePre(info, null);
		expect(state).toBeNull();
		expect(response).toEqual({ action: "pass" });
	});

	it("does not start execution if invoked skill has no curtain annotations", () => {
		const skillDir = path.join(tmpDir, ".agents/skills/plain-skill");
		fs.mkdirSync(skillDir, { recursive: true });
		fs.writeFileSync(
			path.join(skillDir, "SKILL.md"),
			[
				"---",
				"name: plain-skill",
				"description: Normal skill without curtains",
				"---",
				"# Normal Skill",
				"1. Step one",
				"2. Step two",
			].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-skill-plain",
			workspacePath: tmpDir,
			harness: "agy",
			prompt: "/plain-skill",
		};

		const { state, response } = handlePre(info, null);
		expect(state).toBeNull();
		expect(response).toEqual({ action: "pass" });
	});

	it("does not trigger implicit mode for regular conversational chat", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-chat",
			workspacePath: tmpDir,
			harness: "agy",
			prompt: "Can you help me write a new function?",
		};

		const { state, response } = handlePre(info, null);
		expect(state).toBeNull();
		expect(response).toEqual({ action: "pass" });
	});

	it("starts execution when user invokes skill via Markdown link with explicit path", () => {
		const skillDir = path.join(tmpDir, ".agents/skills/curtain-test");
		fs.mkdirSync(skillDir, { recursive: true });
		const skillFile = path.join(skillDir, "SKILL.md");
		fs.writeFileSync(
			skillFile,
			[
				"---",
				"name: curtain-test",
				"description: Follow instructions",
				"---",
				"/curtain curtain-test",
			].join("\n"),
		);
		const playbookFile = path.join(skillDir, "PLAYBOOK.md");
		fs.writeFileSync(
			playbookFile,
			['Say "Step 1"', "> [!INTERMISSION]", 'Say "Step 2"'].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-md-link-path",
			workspacePath: tmpDir,
			harness: "codex",
			prompt: `[$curtain-test](${skillFile}) \n`,
		};

		const { state, response } = handlePre(info, null);
		expect(state?.status).toBe("running");
		expect(state?.script).toBe(playbookFile);
		expect(response.action === "inject" && response.message).toContain(
			'Say "Step 1"',
		);
	});

	it("starts execution when user invokes skill via Markdown link without path", () => {
		const skillDir = path.join(tmpDir, ".agents/skills/link-skill");
		fs.mkdirSync(skillDir, { recursive: true });
		const skillFile = path.join(skillDir, "SKILL.md");
		fs.writeFileSync(
			skillFile,
			[
				"---",
				"name: link-skill",
				"description: Skill invoked by link name",
				"---",
				"/curtain link-skill",
			].join("\n"),
		);
		const playbookFile = path.join(skillDir, "PLAYBOOK.md");
		fs.writeFileSync(
			playbookFile,
			['Say "Act 1"', "> [!INTERMISSION]", 'Say "Act 2"'].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-md-link-name",
			workspacePath: tmpDir,
			harness: "codex",
			prompt: "[$link-skill]",
		};

		const { state, response } = handlePre(info, null);
		expect(state?.status).toBe("running");
		expect(state?.script).toBe(playbookFile);
		expect(response.action === "inject" && response.message).toContain(
			'Say "Act 1"',
		);
	});
});
