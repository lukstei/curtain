import { describe, expect, it } from "vitest";
import { parseScript } from "./parser.ts";
import {
	advanceExecution,
	resumeExecution,
	startExecution,
} from "./transitions.ts";

describe("transitions.ts", () => {
	const sampleScript = parseScript(
		[
			"# Script Title",
			"Step 1: Scaffolding",
			"<!-- intermission -->",
			"Step 2: Verification",
			"<!-- curtain -->",
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
			      "type": "auto",
			    },
			    {
			      "content": "Step 2: Verification",
			      "index": 1,
			      "type": "pause",
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

	it("pauses execution when next step type is pause", () => {
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
			        "type": "auto",
			      },
			      {
			        "content": "Step 2: Verification",
			        "index": 1,
			        "type": "pause",
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
			  "state": {
			    "currentStep": 1,
			    "script": "sample.md",
			    "status": "running",
			    "steps": [
			      {
			        "content": "# Script Title
			Step 1: Scaffolding",
			        "index": 0,
			        "type": "auto",
			      },
			      {
			        "content": "Step 2: Verification",
			        "index": 1,
			        "type": "pause",
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
			    "type": "pause",
			  },
			  "success": true,
			}
		`);
	});

	it("auto-advances when next step type is auto", () => {
		const state = startExecution(sampleScript);
		const pauseResult = advanceExecution(state);
		if (pauseResult.action !== "pause") throw new Error("Expected pause");
		const resumeResult = resumeExecution(pauseResult.state);
		if (!resumeResult.success) throw new Error("Expected success");

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
			        "type": "auto",
			      },
			      {
			        "content": "Step 2: Verification",
			        "index": 1,
			        "type": "pause",
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
		if (!r.success) throw new Error("Expected success");
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
			  "error": "The curtain is not currently paused.",
			  "success": false,
			}
		`);
	});
});
