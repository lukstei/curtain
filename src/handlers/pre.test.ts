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
			{ index: 0, type: "auto", content: "Step 1 content" },
			{ index: 1, type: "pause", content: "Step 2 content" },
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

	it("reports status when user sends /curtain status", () => {
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
			"[CURTAIN STATUS] Step 1/2 | State: paused | Script: sample.md",
		);
	});

	it("passes normal user messages through without state modification", () => {
		const info: HookInfo = {
			type: "pre",
			conversationId: "test-c4",
			workspacePath: "/test",
			latestMessage: {
				type: "USER_INPUT",
				content: "Please check this specific edge case first",
			},
		};

		const { state, response } = handlePre(info, sampleState, env);
		expect(state).toEqual(sampleState);
		expect(response).toEqual({});
	});

	it("starts script on /curtain run <file>", () => {
		const scriptPath = path.join(tmpDir, "run-test.md");
		fs.mkdirSync(tmpDir, { recursive: true });
		fs.writeFileSync(
			scriptPath,
			["Step 1 instruction", "<!-- curtain -->", "Step 2 instruction"].join(
				"\n",
			),
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
