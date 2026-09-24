import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunnerState } from "../state.ts";
import type { HookInfo } from "../types.ts";
import { handlePre } from "./pre.ts";

describe("handlers/pre.ts", () => {
	const tmpDir = path.join(os.tmpdir(), `curtain-pre-test-${Date.now()}`);
	const env = { AGY_PLUGIN_DATA: tmpDir };

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
			latestMessage: {
				type: "USER_INPUT",
				content: "/next",
			},
		};

		const { state, response } = handlePre(info, sampleState, env);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(1);
		expect(response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[STEP 2 OF 2]

			Step 2 content

			Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
			    },
			  ],
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
			latestMessage: {
				type: "USER_INPUT",
				content: "[$next](/path/to/skills/next/SKILL.md) \n",
			},
		};

		const { state, response } = handlePre(info, sampleState, env);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(1);
		expect(response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[STEP 2 OF 2]

			Step 2 content

			Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
			    },
			  ],
			}
		`);
	});

	it("resumes execution when user sends [$next] without path", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c1-bare-link",
			workspacePath: "/test",
			prompt: "[$next]",
			latestMessage: {
				type: "USER_INPUT",
				content: "[$next]",
			},
		};

		const { state } = handlePre(info, sampleState, env);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(1);
	});

	it("remains paused when user enters plain next without slash or brackets", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c1-plain-next",
			workspacePath: "/test",
			prompt: "next",
			latestMessage: {
				type: "USER_INPUT",
				content: "next",
			},
		};

		const { state, response } = handlePre(info, sampleState, env);
		expect(state?.status).toBe("paused");
		expect(state?.currentStep).toBe(0);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toContain(
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
			latestMessage: {
				type: "USER_INPUT",
				content: "/next",
			},
		};

		const { state, response } = handlePre(info, singleStepPausedState, env);
		expect(state).toBeNull();
		expect(response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "Execution complete.",
			    },
			  ],
			}
		`);
	});

	it("replays intermission review instruction on normal user message while paused", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c4-review",
			workspacePath: "/test",
			prompt: "I have added the missing migration column",
			latestMessage: {
				type: "USER_INPUT",
				content: "I have added the missing migration column",
			},
		};

		const { state, response } = handlePre(info, sampleState, env);
		expect(state).toEqual(sampleState);
		expect(response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[INTERMISSION REVIEW]
			Check table schema

			Execution is PAUSED at an intermission. Do NOT execute, advance to, or anticipate any downstream steps from previous messages or memory. Respond ONLY to confirm that execution is paused and that only /next will proceed.",
			    },
			  ],
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
			latestMessage: {
				type: "USER_INPUT",
				content: "Please check this specific edge case first",
			},
		};

		const { state, response } = handlePre(info, stateWithoutInstruction, env);
		expect(state).toEqual(stateWithoutInstruction);
		expect(response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "[INTERMISSION REVIEW]
			Execution is PAUSED at an intermission. Do NOT execute, advance to, or anticipate any downstream steps from previous messages or memory. Respond ONLY to confirm that execution is paused and that only /next will proceed.",
			    },
			  ],
			}
		`);
	});

	it("starts script on /curtain run <file>", () => {
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
			prompt: `/curtain run ${scriptPath}`,
			latestMessage: {
				type: "USER_INPUT",
				content: `/curtain run ${scriptPath}`,
			},
		};

		const { state, response } = handlePre(info, null, env);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(0);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toContain(
			"[STEP 1 OF 2]",
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
			latestMessage: {
				type: "USER_INPUT",
				content: "/deploy-skill",
			},
		};

		const { state, response } = handlePre(info, null, env);
		expect(state?.status).toBe("running");
		expect(state?.currentStep).toBe(0);
		expect(state?.steps.length).toBe(2);
		expect(state?.script).toBe(playbookFile);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toContain(
			"[STEP 1 OF 2]",
		);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toContain(
			"Step 1: Check environment",
		);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toContain(
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

		const { state, response } = handlePre(info, null, env);
		expect(state?.status).toBe("running");
		expect(state?.script).toBe(playbookFile);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toContain(
			"When concluding your turn, inform the user that only /next will proceed.",
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

		const { state, response } = handlePre(info, null, env);
		expect(state?.status).toBe("running");
		expect(state?.script).toBe(playbookFile);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toBeDefined();
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
			latestMessage: {
				type: "USER_INPUT",
				content: "/doc-skill",
			},
		};

		const { state, response } = handlePre(info, null, env);
		expect(state).toBeNull();
		expect(response).toEqual({});
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
			latestMessage: {
				type: "USER_INPUT",
				content: "/plain-skill",
			},
		};

		const { state, response } = handlePre(info, null, env);
		expect(state).toBeNull();
		expect(response).toEqual({});
	});

	it("does not trigger implicit mode for regular conversational chat", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-chat",
			workspacePath: tmpDir,
			harness: "agy",
			prompt: "Can you help me write a new function?",
			latestMessage: {
				type: "USER_INPUT",
				content: "Can you help me write a new function?",
			},
		};

		const { state, response } = handlePre(info, null, env);
		expect(state).toBeNull();
		expect(response).toEqual({});
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
			latestMessage: {
				type: "USER_INPUT",
				content: `[$curtain-test](${skillFile}) \n`,
			},
		};

		const { state, response } = handlePre(info, null, env);
		expect(state?.status).toBe("running");
		expect(state?.script).toBe(playbookFile);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toContain(
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
			latestMessage: {
				type: "USER_INPUT",
				content: "[$link-skill]",
			},
		};

		const { state, response } = handlePre(info, null, env);
		expect(state?.status).toBe("running");
		expect(state?.script).toBe(playbookFile);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toContain(
			'Say "Act 1"',
		);
	});
});
