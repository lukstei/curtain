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
		totalSteps: 2,
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

	it("resumes execution when user sends /curtain raise", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c1",
			workspacePath: "/test",
			latestMessage: {
				type: "USER_INPUT",
				content: "/curtain raise",
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

			Perform ONLY this step. Conclude when complete.",
			    },
			  ],
			}
		`);
	});

	it("completes execution when user sends /curtain raise on final step intermission", () => {
		const singleStepPausedState: RunnerState = {
			script: "sample.md",
			status: "paused",
			currentStep: 0,
			totalSteps: 1,
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
			latestMessage: {
				type: "USER_INPUT",
				content: "/curtain raise",
			},
		};

		const { state, response } = handlePre(info, singleStepPausedState, env);
		expect(state).toBeNull();
		expect(response).toMatchInlineSnapshot(`
			{
			  "injectSteps": [
			    {
			      "ephemeralMessage": "Curtain raised. Execution complete.",
			    },
			  ],
			}
		`);
	});

	it("drops execution when user sends /curtain drop", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c2",
			workspacePath: "/test",
			latestMessage: {
				type: "USER_INPUT",
				content: "/curtain drop",
			},
		};

		const { state, response } = handlePre(info, sampleState, env);
		expect(state).toBeNull();
		expect(response.injectSteps?.[0]?.ephemeralMessage).toBe(
			"Curtain dropped. Execution stopped.",
		);
	});

	it("reports status with intermission info when user sends /curtain status while paused", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c3",
			workspacePath: "/test",
			latestMessage: {
				type: "USER_INPUT",
				content: "/curtain status",
			},
		};

		const { state, response } = handlePre(info, sampleState, env);
		expect(state).toEqual(sampleState);
		expect(response.injectSteps?.[0]?.ephemeralMessage).toBe(
			"[CURTAIN STATUS] Step 1/2 | State: paused | Script: sample.md | Intermission: Check table schema",
		);
	});

	it("replays intermission review instruction on normal user message while paused", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c4-review",
			workspacePath: "/test",
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

			Conclude your turn when complete. The curtain remains paused until the user enters /curtain raise.",
			    },
			  ],
			}
		`);
	});

	it("passes normal user messages through when paused without intermission instruction", () => {
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
			latestMessage: {
				type: "USER_INPUT",
				content: "Please check this specific edge case first",
			},
		};

		const { state, response } = handlePre(info, stateWithoutInstruction, env);
		expect(state).toEqual(stateWithoutInstruction);
		expect(response).toEqual({});
	});

	it("starts script on /curtain run <file>", () => {
		const scriptPath = path.join(tmpDir, "run-test.md");
		fs.mkdirSync(tmpDir, { recursive: true });
		fs.writeFileSync(
			scriptPath,
			["Step 1 instruction", "> [!CURTAIN]", "Step 2 instruction"].join("\n"),
		);

		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c5",
			workspacePath: tmpDir,
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
});
