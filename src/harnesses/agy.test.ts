import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { agyHarness, parseAgyMessage } from "./agy.ts";
import type { NormalizedEvent } from "./types.ts";

function createMockEvent(
	overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
	return {
		type: "pre",
		harness: "agy",
		conversationId: "test-agy-conv",
		workspacePath: "/test/project",
		prompt: "",
		latestMessage: null,
		rawPayload: {},
		...overrides,
	} as NormalizedEvent;
}

describe("agyHarness", () => {
	describe("detect", () => {
		it("detects AGY_HOOK_ACTIVE", () => {
			expect(agyHarness.detect({}, { AGY_HOOK_ACTIVE: "1" })).toBe(true);
		});

		it("detects ANTIGRAVITY_CONVERSATION_ID", () => {
			expect(
				agyHarness.detect({}, { ANTIGRAVITY_CONVERSATION_ID: "uuid-1" }),
			).toBe(true);
		});

		it("detects GEMINI_CLI or ANTIGRAVITY environment variables", () => {
			expect(agyHarness.detect({}, { GEMINI_CLI: "1" })).toBe(true);
			expect(agyHarness.detect({}, { ANTIGRAVITY: "1" })).toBe(true);
		});

		it("detects artifactDirectoryPath in payload", () => {
			expect(
				agyHarness.detect({ artifactDirectoryPath: "/path/to/artifacts" }, {}),
			).toBe(true);
		});

		it("detects transcriptPath ending with .system_generated/logs/transcript.jsonl", () => {
			expect(
				agyHarness.detect(
					{
						transcriptPath:
							"/home/user/.gemini/antigravity/brain/uuid/.system_generated/logs/transcript.jsonl",
					},
					{},
				),
			).toBe(true);
		});

		it("returns false for non-matching payload", () => {
			expect(agyHarness.detect({ conversationId: "c1" }, {})).toBe(false);
		});
	});

	describe("normalize", () => {
		it("normalizes pre-invocation event", () => {
			const event = agyHarness.normalize({
				conversationId: "c-agy",
				workspacePaths: ["/agy/project"],
				prompt: "/next",
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "c-agy",
				  "harness": "agy",
				  "latestMessage": {
				    "content": "/next",
				    "type": "USER_INPUT",
				  },
				  "prompt": "/next",
				  "rawPayload": {
				    "conversationId": "c-agy",
				    "prompt": "/next",
				    "workspacePaths": [
				      "/agy/project",
				    ],
				  },
				  "type": "pre",
				  "workspacePath": "/agy/project",
				}
			`);
		});

		it("normalizes stop event", () => {
			const event = agyHarness.normalize({
				conversationId: "c-agy",
				workspacePaths: ["/agy/project"],
				terminationReason: "model_stop",
			});
			assert(event.type === "stop");
			expect(event.isStop).toBe(true);
		});

		it("normalizes pre-invocation event with wrapped USER_REQUEST and SKILL metadata", () => {
			const event = agyHarness.normalize({
				conversationId: "ad572610-6787-4054-8cbf-77957f214fcf",
				workspacePaths: ["/Users/Lukas.Steinbrecher/Downloads/skill-test"],
				prompt: `<USER_REQUEST>\n/weekend \n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n/weekend is a [Slash Command]:\n<SKILL>The user requested you read and use the "weekend" skill. The path to the skill file is:\n/Users/Lukas.Steinbrecher/Downloads/skill-test/.agents/skills/weekend/SKILL.md</SKILL>\n</ADDITIONAL_METADATA>`,
			});
			expect(event).toMatchInlineSnapshot(`
				{
				  "conversationId": "ad572610-6787-4054-8cbf-77957f214fcf",
				  "harness": "agy",
				  "latestMessage": {
				    "content": "/weekend",
				    "skillInvocationPath": "/Users/Lukas.Steinbrecher/Downloads/skill-test/.agents/skills/weekend/SKILL.md",
				    "type": "USER_INPUT",
				  },
				  "prompt": "/weekend",
				  "rawPayload": {
				    "conversationId": "ad572610-6787-4054-8cbf-77957f214fcf",
				    "prompt": "<USER_REQUEST>
				/weekend 
				</USER_REQUEST>
				<ADDITIONAL_METADATA>
				/weekend is a [Slash Command]:
				<SKILL>The user requested you read and use the "weekend" skill. The path to the skill file is:
				/Users/Lukas.Steinbrecher/Downloads/skill-test/.agents/skills/weekend/SKILL.md</SKILL>
				</ADDITIONAL_METADATA>",
				    "workspacePaths": [
				      "/Users/Lukas.Steinbrecher/Downloads/skill-test",
				    ],
				  },
				  "skillInvocationPath": "/Users/Lukas.Steinbrecher/Downloads/skill-test/.agents/skills/weekend/SKILL.md",
				  "type": "pre",
				  "workspacePath": "/Users/Lukas.Steinbrecher/Downloads/skill-test",
				}
			`);
		});

		it("normalizes tool event and extracts readTargetFilePath", () => {
			const event = agyHarness.normalize({
				conversationId: "c-agy",
				workspacePaths: ["/agy/project"],
				toolCall: {
					name: "view_file",
					args: { AbsolutePath: "/agy/project/SKILL.md" },
				},
			});
			assert(event.type === "tool");
			expect(event.readTargetFilePath).toBe("/agy/project/SKILL.md");
		});
	});

	describe("parseAgyMessage", () => {
		it("unwraps USER_REQUEST and extracts SKILL path", () => {
			const res = parseAgyMessage({
				type: "USER_INPUT",
				content: `<USER_REQUEST>\n/weekend \n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n<SKILL>The user requested you read and use the "weekend" skill. The path to the skill file is:\n/path/to/weekend/SKILL.md</SKILL>\n</ADDITIONAL_METADATA>`,
			});
			expect(res).toMatchInlineSnapshot(`
				{
				  "content": "/weekend",
				  "skillInvocationPath": "/path/to/weekend/SKILL.md",
				  "type": "USER_INPUT",
				}
			`);
		});

		it("extracts SKILL path with spaces", () => {
			const res = parseAgyMessage({
				type: "USER_INPUT",
				content: `<USER_REQUEST>\n/weekend \n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n<SKILL>The user requested you read and use the "weekend" skill. The path to the skill file is:\n/Users/Jane Doe/my skills/weekend/SKILL.md</SKILL>\n</ADDITIONAL_METADATA>`,
			});
			expect(res).toMatchInlineSnapshot(`
				{
				  "content": "/weekend",
				  "skillInvocationPath": "/Users/Jane Doe/my skills/weekend/SKILL.md",
				  "type": "USER_INPUT",
				}
			`);
		});

		it("parses model response as PLANNER_RESPONSE", () => {
			const res = parseAgyMessage({
				type: "PLANNER_RESPONSE",
				content: "All done!",
			});
			expect(res).toMatchInlineSnapshot(`
				{
				  "content": "All done!",
				  "type": "PLANNER_RESPONSE",
				}
			`);
		});
	});

	describe("extractFileReadTarget", () => {
		it("extracts AbsolutePath for view_file", () => {
			const target = agyHarness.extractFileReadTarget?.(
				{ name: "view_file", args: { AbsolutePath: "/path/to/SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/path/to/SKILL.md");
		});

		it("resolves relative path against workspace", () => {
			const target = agyHarness.extractFileReadTarget?.(
				{ name: "view_file", args: { AbsolutePath: "SKILL.md" } },
				"/workspace",
			);
			expect(target).toBe("/workspace/SKILL.md");
		});

		it("returns null for non-reading tools", () => {
			const target = agyHarness.extractFileReadTarget?.(
				{ name: "run_command", args: { CommandLine: "ls" } },
				"/workspace",
			);
			expect(target).toBeNull();
		});
	});

	describe("extractLatestMessage", () => {
		it("extracts user prompt when present on first invocation", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "/next",
				rawPayload: { invocationNum: 0 },
			});
			const res = agyHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "USER_INPUT",
				content: "/next",
			});
		});

		it("returns null on pre when invocationNum > 0 (prevent stale input re-injection)", () => {
			const event = createMockEvent({
				type: "pre",
				prompt: "/next",
				rawPayload: { invocationNum: 1 },
			});
			expect(agyHarness.extractLatestMessage(event)).toBeNull();
		});

		it("extracts last_assistant_message on stop when transcript is absent", () => {
			const event = createMockEvent({
				type: "stop",
				rawPayload: { last_assistant_message: "AGY response" },
			});
			const res = agyHarness.extractLatestMessage(event);
			expect(res).toEqual({
				type: "PLANNER_RESPONSE",
				content: "AGY response",
			});
		});

		it("returns null when no transcript, no assistant message, and no prompt", () => {
			const event = createMockEvent({ type: "stop" });
			expect(agyHarness.extractLatestMessage(event)).toBeNull();
		});
	});

	describe("formatEgress", () => {
		it("formats Stop continue decision as continue", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = agyHarness.formatEgress(event, {
				decision: "continue",
				reason: "Execute step 2",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "continue",
				  "reason": "Execute step 2",
				}
			`);
		});

		it("formats Stop allow decision", () => {
			const event = createMockEvent({ type: "stop", isStop: true });
			const egress = agyHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "allow",
				}
			`);
		});

		it("formats PreInvocation injectSteps", () => {
			const event = createMockEvent({ type: "pre" });
			const egress = agyHarness.formatEgress(event, {
				injectSteps: [{ ephemeralMessage: "Instruction for step 1" }],
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "injectSteps": [
				    {
				      "ephemeralMessage": "Instruction for step 1",
				    },
				  ],
				}
			`);
		});

		it("formats tool deny decision", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = agyHarness.formatEgress(event, {
				decision: "deny",
				reason: "Blocked by Curtain",
			});
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "deny",
				  "reason": "Blocked by Curtain",
				}
			`);
		});

		it("formats tool allow decision", () => {
			const event = createMockEvent({ type: "tool" });
			const egress = agyHarness.formatEgress(event, { decision: "allow" });
			expect(egress.exitCode).toBe(0);
			expect(JSON.parse(egress.stdout ?? "{}")).toMatchInlineSnapshot(`
				{
				  "decision": "allow",
				}
			`);
		});
	});

	describe("getSkillDirs", () => {
		it("returns generic and AGY skill directories", () => {
			const dirs = agyHarness.getSkillDirs?.("/workspace", {
				HOME: "/home/user",
			});
			expect(dirs).toEqual([
				"/workspace/.agents/skills",
				"/workspace/skills",
				"/workspace/.agents/plugins",
				"/home/user/.gemini/config/skills",
				"/home/user/.gemini/config/plugins",
				"/home/user/.gemini/antigravity/builtin/skills",
			]);
		});
	});

	describe("extractSkillTarget", () => {
		it("extracts target from invoke_subagent tool call", () => {
			expect(
				agyHarness.extractSkillTarget?.({
					name: "invoke_subagent",
					args: {
						Subagents: [{ TypeName: "curtain-subagent", Role: "Runner" }],
					},
				}),
			).toBe("curtain-subagent");
		});

		it("extracts target from Skill tool call", () => {
			expect(
				agyHarness.extractSkillTarget?.({
					name: "Skill",
					args: { skill: "curtain:next" },
				}),
			).toBe("curtain:next");
		});

		it("returns null for other tool calls", () => {
			expect(
				agyHarness.extractSkillTarget?.({
					name: "view_file",
					args: { AbsolutePath: "/path/to/file" },
				}),
			).toBeNull();
		});
	});
});
