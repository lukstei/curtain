import { describe, expect, it } from "vitest";
import { parseScript } from "./parser/index.ts";
import {
	advanceExecution,
	executeResume,
	executeStart,
	formatIntermissionPrompt,
	formatStepPrompt,
	resumeExecution,
	startExecution,
} from "./transitions.ts";

describe("transitions.ts", () => {
	const sampleScript = parseScript(
		[
			"# Script Title",
			"Step 1: Scaffolding",
			"> [!INTERMISSION]",
			"Step 2: Verification",
			"> [!CURTAIN]",
			"Step 3: Cleanup",
		].join("\n"),
		"sample.md",
	);

	it("starts execution at step 0 in running status", () => {
		const state = startExecution(sampleScript);
		expect(state).toMatchInlineSnapshot(`
			{
			  "currentStep": 0,
			  "script": "sample.md",
			  "status": "running",
			  "steps": [
			    {
			      "content": "# Script Title

			Step 1: Scaffolding",
			      "index": 0,
			      "type": "pause",
			    },
			    {
			      "content": "Step 2: Verification",
			      "index": 1,
			      "type": "auto",
			    },
			    {
			      "content": "Step 3: Cleanup",
			      "index": 2,
			      "type": "auto",
			    },
			  ],
			}
		`);
	});

	it("starts execution with optional skillName", () => {
		const state = startExecution(sampleScript, "my-skill");
		expect(state).toMatchInlineSnapshot(`
			{
			  "currentStep": 0,
			  "script": "sample.md",
			  "skillName": "my-skill",
			  "status": "running",
			  "steps": [
			    {
			      "content": "# Script Title

			Step 1: Scaffolding",
			      "index": 0,
			      "type": "pause",
			    },
			    {
			      "content": "Step 2: Verification",
			      "index": 1,
			      "type": "auto",
			    },
			    {
			      "content": "Step 3: Cleanup",
			      "index": 2,
			      "type": "auto",
			    },
			  ],
			}
		`);
	});

	it("pauses execution when current step type is pause", () => {
		const state = startExecution(sampleScript);
		const result = advanceExecution(state);
		expect(result).toMatchInlineSnapshot(`
			{
			  "action": "pause",
			  "state": {
			    "currentStep": 0,
			    "script": "sample.md",
			    "status": "paused",
			    "steps": [
			      {
			        "content": "# Script Title

			Step 1: Scaffolding",
			        "index": 0,
			        "type": "pause",
			      },
			      {
			        "content": "Step 2: Verification",
			        "index": 1,
			        "type": "auto",
			      },
			      {
			        "content": "Step 3: Cleanup",
			        "index": 2,
			        "type": "auto",
			      },
			    ],
			  },
			}
		`);
	});

	it("resumes paused execution to next step", () => {
		const state = startExecution(sampleScript);
		const pauseResult = advanceExecution(state);
		if (pauseResult.action !== "pause") throw new Error("Expected pause");

		const resumeResult = resumeExecution(pauseResult.state);
		expect(resumeResult).toMatchInlineSnapshot(`
			{
			  "action": "advance",
			  "state": {
			    "currentStep": 1,
			    "script": "sample.md",
			    "status": "running",
			    "steps": [
			      {
			        "content": "# Script Title

			Step 1: Scaffolding",
			        "index": 0,
			        "type": "pause",
			      },
			      {
			        "content": "Step 2: Verification",
			        "index": 1,
			        "type": "auto",
			      },
			      {
			        "content": "Step 3: Cleanup",
			        "index": 2,
			        "type": "auto",
			      },
			    ],
			  },
			  "step": {
			    "content": "Step 2: Verification",
			    "index": 1,
			    "type": "auto",
			  },
			}
		`);
	});

	it("resumes paused execution on final step by completing execution", () => {
		const scriptWithFinalPause = parseScript(
			[
				"# Single Step",
				"Perform task",
				"> [!INTERMISSION] Review before finish",
			].join("\n"),
			"single.md",
		);
		const state = startExecution(scriptWithFinalPause);
		const pauseResult = advanceExecution(state);
		if (pauseResult.action !== "pause") throw new Error("Expected pause");

		const resumeResult = resumeExecution(pauseResult.state);
		expect(resumeResult).toMatchInlineSnapshot(`
			{
			  "action": "finish",
			}
		`);
	});

	it("auto-advances when current step type is auto", () => {
		const state = startExecution(sampleScript);
		const pauseResult = advanceExecution(state);
		if (pauseResult.action !== "pause") throw new Error("Expected pause");
		const resumeResult = resumeExecution(pauseResult.state);
		if (resumeResult.action !== "advance") throw new Error("Expected advance");

		const autoAdvanceResult = advanceExecution(resumeResult.state);
		expect(autoAdvanceResult).toMatchInlineSnapshot(`
			{
			  "action": "advance",
			  "state": {
			    "currentStep": 2,
			    "script": "sample.md",
			    "status": "running",
			    "steps": [
			      {
			        "content": "# Script Title

			Step 1: Scaffolding",
			        "index": 0,
			        "type": "pause",
			      },
			      {
			        "content": "Step 2: Verification",
			        "index": 1,
			        "type": "auto",
			      },
			      {
			        "content": "Step 3: Cleanup",
			        "index": 2,
			        "type": "auto",
			      },
			    ],
			  },
			  "step": {
			    "content": "Step 3: Cleanup",
			    "index": 2,
			    "type": "auto",
			  },
			}
		`);
	});

	it("finishes when advancing past final step", () => {
		const state = startExecution(sampleScript);
		const p = advanceExecution(state);
		if (p.action !== "pause") throw new Error("Expected pause");
		const r = resumeExecution(p.state);
		if (r.action !== "advance") throw new Error("Expected advance");
		const a = advanceExecution(r.state);
		if (a.action !== "advance") throw new Error("Expected advance");

		const finishResult = advanceExecution(a.state);
		expect(finishResult).toMatchInlineSnapshot(`
			{
			  "action": "finish",
			}
		`);
	});

	it("fails resuming when not in paused status", () => {
		const state = startExecution(sampleScript);
		const result = resumeExecution(state);
		expect(result).toMatchInlineSnapshot(`
			{
			  "action": "error",
			  "error": "The curtain is not currently paused.",
			}
		`);
	});

	it("formats step prompt with and without criteria", () => {
		const stepWithoutInstruction = {
			index: 0,
			type: "auto" as const,
			content: "Scaffold project",
		};
		expect(formatStepPrompt(stepWithoutInstruction, 3)).toBe(
			"[STEP 1 OF 3]\n\nScaffold project\n\nPerform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
		);

		const stepWithPauseInstruction = {
			index: 0,
			type: "pause" as const,
			content: "Run test suite",
			instruction: "Ensure 100% pass rate",
		};
		expect(formatStepPrompt(stepWithPauseInstruction, 3)).toBe(
			"[STEP 1 OF 3]\n\nRun test suite\n\n[INTERMISSION CRITERIA]\nEnsure 100% pass rate\n\nPerform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
		);

		const stepWithAutoInstruction = {
			index: 1,
			type: "auto" as const,
			content: "Build artifacts",
			instruction: "Check bundle size",
		};
		expect(formatStepPrompt(stepWithAutoInstruction, 3)).toBe(
			"[STEP 2 OF 3]\n\nBuild artifacts\n\n[TRANSITION CRITERIA]\nCheck bundle size\n\nPerform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
		);
	});

	it("formats intermission review prompt", () => {
		expect(formatIntermissionPrompt()).toMatchInlineSnapshot(`
			"[INTERMISSION REVIEW]

			Execution is PAUSED at an intermission for human review.

			- Follow and execute all instructions, adjustments, or questions given by the user in their prompt.

			- Present your completed work or findings clearly for the user to review, using the review sidebar artifact if applicable.

			- Do NOT execute, advance to, or anticipate any DOWNSTREAM or FUTURE steps from the playbook script.

			- Remind the user that execution remains paused at this intermission and only typing /next will advance to the next playbook step."
		`);

		expect(
			formatIntermissionPrompt("Verify lint checks pass"),
		).toMatchInlineSnapshot(`
			"[INTERMISSION REVIEW]

			Verify lint checks pass

			Execution is PAUSED at an intermission for human review.

			- Follow and execute all instructions, adjustments, or questions given by the user in their prompt.

			- Present your completed work or findings clearly for the user to review, using the review sidebar artifact if applicable.

			- Do NOT execute, advance to, or anticipate any DOWNSTREAM or FUTURE steps from the playbook script.

			- Remind the user that execution remains paused at this intermission and only typing /next will advance to the next playbook step."
		`);
	});

	describe("executeStart", () => {
		it("initializes execution and formats the first step prompt", () => {
			const res = executeStart(sampleScript);
			expect(res).toMatchInlineSnapshot(`
				{
				  "message": "[STEP 1 OF 3]

				# Script Title

				Step 1: Scaffolding

				Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
				  "nextState": {
				    "currentStep": 0,
				    "script": "sample.md",
				    "status": "running",
				    "steps": [
				      {
				        "content": "# Script Title

				Step 1: Scaffolding",
				        "index": 0,
				        "type": "pause",
				      },
				      {
				        "content": "Step 2: Verification",
				        "index": 1,
				        "type": "auto",
				      },
				      {
				        "content": "Step 3: Cleanup",
				        "index": 2,
				        "type": "auto",
				      },
				    ],
				  },
				}
			`);
		});

		it("initializes execution with optional skillName", () => {
			const res = executeStart(sampleScript, "curtain-skill");
			expect(res.nextState.skillName).toBe("curtain-skill");
		});
	});

	describe("executeResume", () => {
		it("returns error action when runner is not paused", () => {
			const state = startExecution(sampleScript);
			const res = executeResume(state);
			expect(res).toMatchInlineSnapshot(`
				{
				  "action": "error",
				  "message": "The curtain is not currently paused.",
				  "nextState": {
				    "currentStep": 0,
				    "script": "sample.md",
				    "status": "running",
				    "steps": [
				      {
				        "content": "# Script Title

				Step 1: Scaffolding",
				        "index": 0,
				        "type": "pause",
				      },
				      {
				        "content": "Step 2: Verification",
				        "index": 1,
				        "type": "auto",
				      },
				      {
				        "content": "Step 3: Cleanup",
				        "index": 2,
				        "type": "auto",
				      },
				    ],
				  },
				}
			`);
		});

		it("advances to next step with formatted prompt when paused", () => {
			const state = startExecution(sampleScript);
			const pausedState = { ...state, status: "paused" as const };
			const res = executeResume(pausedState);
			expect(res).toMatchInlineSnapshot(`
				{
				  "action": "advance",
				  "message": "[STEP 2 OF 3]

				Step 2: Verification

				Perform ONLY this step. Conclude when complete. Do NOT anticipate or execute any future steps.",
				  "nextState": {
				    "currentStep": 1,
				    "script": "sample.md",
				    "status": "running",
				    "steps": [
				      {
				        "content": "# Script Title

				Step 1: Scaffolding",
				        "index": 0,
				        "type": "pause",
				      },
				      {
				        "content": "Step 2: Verification",
				        "index": 1,
				        "type": "auto",
				      },
				      {
				        "content": "Step 3: Cleanup",
				        "index": 2,
				        "type": "auto",
				      },
				    ],
				  },
				}
			`);
		});

		it("returns finish action when resuming at final step", () => {
			const state = startExecution(sampleScript);
			const finalPausedState = {
				...state,
				currentStep: 2,
				status: "paused" as const,
			};
			const res = executeResume(finalPausedState);
			expect(res).toMatchInlineSnapshot(`
				{
				  "action": "finish",
				  "message": "Execution complete.",
				  "nextState": null,
				}
			`);
		});
	});
});
