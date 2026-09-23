import { describe, expect, it } from "vitest";
import { parseScript } from "./parser.ts";
import {
	advanceExecution,
	formatStatus,
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
			  "totalSteps": 3,
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
			    "totalSteps": 3,
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
			    "totalSteps": 3,
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
			    "totalSteps": 3,
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
			"[STEP 1 OF 3]\n\nScaffold project\n\nPerform ONLY this step. Conclude when complete.",
		);

		const stepWithPauseInstruction = {
			index: 0,
			type: "pause" as const,
			content: "Run test suite",
			instruction: "Ensure 100% pass rate",
		};
		expect(formatStepPrompt(stepWithPauseInstruction, 3)).toBe(
			"[STEP 1 OF 3]\n\nRun test suite\n\n[INTERMISSION CRITERIA]\nEnsure 100% pass rate\n\nPerform ONLY this step. Conclude when complete. When concluding your turn, inform the user that only /next will proceed.",
		);

		const stepWithAutoInstruction = {
			index: 1,
			type: "auto" as const,
			content: "Build artifacts",
			instruction: "Check bundle size",
		};
		expect(formatStepPrompt(stepWithAutoInstruction, 3)).toBe(
			"[STEP 2 OF 3]\n\nBuild artifacts\n\n[TRANSITION CRITERIA]\nCheck bundle size\n\nPerform ONLY this step. Conclude when complete.",
		);
	});

	it("formats status message with intermission info when paused", () => {
		expect(formatStatus(null)).toBe(
			"[CURTAIN STATUS] No active script running.",
		);

		const runningState = {
			script: "test.md",
			status: "running" as const,
			currentStep: 0,
			totalSteps: 2,
			steps: [
				{ index: 0, type: "auto" as const, content: "Step 1" },
				{ index: 1, type: "auto" as const, content: "Step 2" },
			],
		};
		expect(formatStatus(runningState)).toBe(
			"[CURTAIN STATUS] Step 1/2 | State: running | Script: test.md",
		);

		const pausedStateWithInstruction = {
			script: "test.md",
			status: "paused" as const,
			currentStep: 0,
			totalSteps: 2,
			steps: [
				{
					index: 0,
					type: "pause" as const,
					content: "Step 1",
					instruction: "Check audit logs",
				},
				{ index: 1, type: "auto" as const, content: "Step 2" },
			],
		};
		expect(formatStatus(pausedStateWithInstruction)).toBe(
			"[CURTAIN STATUS] Step 1/2 | State: paused | Script: test.md | Intermission: Check audit logs",
		);

		const pausedStateWithMultiLineInstruction = {
			script: "test.md",
			status: "paused" as const,
			currentStep: 0,
			totalSteps: 1,
			steps: [
				{
					index: 0,
					type: "pause" as const,
					content: "Step 1",
					instruction: "Check audit logs\n- Ensure no errors\n- Verify latency",
				},
			],
		};
		expect(formatStatus(pausedStateWithMultiLineInstruction)).toBe(
			"[CURTAIN STATUS] Step 1/1 | State: paused | Script: test.md | Intermission: Check audit logs",
		);
	});
});
