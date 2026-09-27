# Harness Anti-Patterns & Architecture Guide

This document captures recurring anti-patterns identified across harness adapter implementations (such as `codex.ts` and `agy.ts`), explaining why they cause issues and providing target reference patterns.

---

## 1. Speculative Environment Sniffing (`[ttpx]`)

### Problem
Stacking weak, ambiguous, or incidental indicators to detect a harness. Inspecting arbitrary substrings (`transcript_path.includes("/.codex/")`) or checking generic properties (`turn_id !== undefined`) leads to false positives when other harnesses emit similar telemetry or directory layouts.

### What NOT to do
```typescript
// src/harnesses/codex.ts
detect(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
	return Boolean(
		env.CODEX_SESSION_ID ||
			env.PLUGIN_DATA ||
			payload.turn_id !== undefined ||
			payload.hookEventName !== undefined ||
			(typeof payload.transcript_path === "string" &&
				payload.transcript_path.includes("/.codex/")),
	);
}
```

### Why it hurts
- Transcripts or file paths containing `/.codex/` in a test or shared cache will misidentify other agent environments (e.g. Claude Code or Copilot) as Codex.
- Obscures the contract: either an authoritative environment indicator is present, or it is not.

### Better
Rely strictly on authoritative indicators guaranteed by the runner environment.

```typescript
detect(_payload: Record<string, unknown>, env: NodeJS.ProcessEnv): boolean {
	return Boolean(env.CODEX_SESSION_ID);
}
```

---

## 2. Ghost Field Fallbacks (`[h7qy]`)

### Problem
Copying schema assumptions across harnesses and chaining defensive defaults. For example, Codex hooks pass `cwd` and do not produce `workspacePaths`. Chaining fallbacks masks schema misunderstandings and keeps dead code alive.

### What NOT to do
```typescript
// src/harnesses/codex.ts
const workspacePaths: string[] =
	Array.isArray(payload.workspacePaths) && payload.workspacePaths.length > 0
		? (payload.workspacePaths as unknown[]).map(String)
		: [String(payload.cwd ?? ctx.env.PWD ?? ".")];
```

### Why it hurts
- Misleads readers into believing Codex provides `workspacePaths`.
- Silent fallbacks prevent noticing when a harness payload format actually breaks or deviates from specification.
- Creates multiple layers of fallback logic (`workspacePaths` -> `cwd` -> `PWD` -> `"."`) when only one canonical field exists.

### Better
Assert and read the exact field defined by the platform's hook specification.

```typescript
assert(typeof payload.cwd === "string", "Codex payload requires cwd");
const workspacePath = payload.cwd;
```

---

## 3. Casing & Schema Hedging (`[szyu]`)

### Problem
Hedging against unknown casing styles (`hook_event_name` vs `hookEventName`) and supplying fallback defaults for required platform fields.

### What NOT to do
```typescript
// src/harnesses/codex.ts
const hookEventName =
	typeof payload.hook_event_name === "string"
		? payload.hook_event_name
		: typeof payload.hookEventName === "string"
			? payload.hookEventName
			: "UserPromptSubmit";
```

### Why it hurts
- The Codex hook specification strictly uses `snake_case` (`hook_event_name`). Hedging creates the illusion of flexibility while concealing invalid payloads.
- Defaulting to `"UserPromptSubmit"` causes unhandled events (like `SessionEnd`) to silently run as prompt submissions rather than failing fast.

### Better
Read the documented casing directly. Assert or reject unexpected inputs at the boundary.

```typescript
assert(typeof payload.hook_event_name === "string", "Missing hook_event_name");
const hookEventName = payload.hook_event_name;
```

---

## 4. Domain Policy & String Duplication in Adapters (`[qtvr]`)

### Problem
Embedding business logic, policy checks, and user-facing denial messages directly inside harness adapters instead of shared domain actions.

### What NOT to do
```typescript
// src/harnesses/codex.ts
const skillName = resolveSkillNameFromPath(targetPath);
if (skillName && ctx.state) {
	if (skillName === "next") {
		return codexToolDeny(
			"BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
			ctx.state,
		);
	}
	if (ctx.state.skillName?.toLowerCase() === skillName.toLowerCase()) {
		return codexToolDeny(
			"BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke the active skill via the Skill tool. Execute the active step instructions directly.",
			ctx.state,
		);
	}
}
```

### Why it hurts
- Identical checks and denial messages get duplicated across adapters (`agy.ts`, `codex.ts`, etc.).
- Modifying policy wording requires editing every harness file.
- Violates separation of concerns: adapters should only handle ingress parsing and egress formatting; domain rules belong in `src/actions.ts`.

### Better
Extract policy evaluations into pure functions in `src/actions.ts`. Adapters only map the outcome.

```typescript
// In src/actions.ts:
export function guardSkillInvocation(params: {
	skillTarget: string;
	state: RunnerState;
}): GuardResult {
	const parsed = parseSkill(params.skillTarget);
	if (parsed?.namespace === "curtain" && parsed.name === "next") {
		return {
			blocked: true,
			reason: "BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
		};
	}
	if (params.state.skillName && params.state.skillName.toLowerCase() === params.skillTarget.toLowerCase()) {
		return {
			blocked: true,
			reason: "BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke the active skill via the Skill tool. Execute the active step instructions directly.",
		};
	}
	return { blocked: false };
}

// In src/harnesses/codex.ts:
if (skillTarget && ctx.state) {
	const guard = guardSkillInvocation({ skillTarget, state: ctx.state });
	if (guard.blocked) return codexToolDeny(guard.reason, ctx.state);
}
```

---

## 5. Untyped Dictionary Sifting vs Discriminated Unions (`[6u5w]`)

### Problem
Accepting `payload: Record<string, unknown>` directly into `handle()` and performing manual type checks, nested property accesses, and string conversions across multiple `if (ctx.mode === ...)` blocks.

### What NOT to do
```typescript
// src/harnesses/codex.ts
handle(payload: Record<string, unknown>, ctx: HarnessContext): HarnessResult {
	if (ctx.mode === "pre") {
		const prompt = typeof payload.prompt === "string" ? payload.prompt : undefined;
		if (!prompt) return codexResult("{}", ctx.state);
		// ...
	}
	if (ctx.mode === "stop") {
		const terminationReason = typeof payload.terminationReason === "string"
			? payload.terminationReason
			: null;
		// ...
	}
	if (ctx.mode === "tool") {
		const toolCall = extractToolCall(payload);
		// ...
	}
}
```

### Why it hurts
- The shape of `payload` depends on `mode` (and event name), but TypeScript only sees an untyped dictionary.
- Invariants are checked repeatedly and defensively in every branch.
- Modifying or adding events requires scanning property lookups rather than relying on compiler-checked discriminated unions.

### Better
Parse and validate the wire payload into a discriminated union at the entry point. `handle()` then switches over verified types.

```typescript
type CodexEvent =
	| { kind: "session_start" }
	| { kind: "prompt"; prompt: string; cwd: string }
	| { kind: "stop"; terminationReason: string | null }
	| { kind: "tool"; toolCall: ToolCall; cwd: string };

function parseCodexEvent(payload: Record<string, unknown>, mode: HookMode): CodexEvent {
	if (mode === "pre") {
		if (typeof payload.prompt === "string" && payload.prompt.trim()) {
			assert(typeof payload.cwd === "string", "Missing cwd in prompt event");
			return { kind: "prompt", prompt: payload.prompt, cwd: payload.cwd };
		}
		return { kind: "session_start" };
	}
	if (mode === "stop") {
		return {
			kind: "stop",
			terminationReason: typeof payload.terminationReason === "string" ? payload.terminationReason : null,
		};
	}
	const toolCall = extractToolCall(payload);
	assert(toolCall, "Missing tool call in tool event");
	assert(typeof payload.cwd === "string", "Missing cwd in tool event");
	return { kind: "tool", toolCall, cwd: payload.cwd };
}

// Handler becomes pure domain mapping:
export const codexHarness: HarnessAdapter = {
	// ...
	handle(payload: Record<string, unknown>, ctx: HarnessContext): HarnessResult {
		const event = parseCodexEvent(payload, ctx.mode);

		switch (event.kind) {
			case "session_start":
				return codexResult("{}", ctx.state);

			case "prompt": {
				const res = resolveUserPrompt({
					prompt: event.prompt,
					state: ctx.state,
					workspacePaths: [event.cwd],
					harness: "codex",
				});
				return formatPromptEgress(res);
			}

			case "stop": {
				const res = advanceTurn({ state: ctx.state, terminationReason: event.terminationReason });
				return formatStopEgress(res);
			}

			case "tool": {
				return handleToolEvent(event, ctx);
			}
		}
	},
};
```

---

## 6. Permissive Nullable / Optional Parameter Types

### Problem
Marking function parameters as nullable or optional (`skillTarget: string | null`, `state: RunnerState | null`) when the function only has meaningful work to do on concrete values.

### What NOT to do
```typescript
// src/actions.ts:284
export function guardSkillInvocation(params: {
	skillTarget: string | null;
	state: RunnerState | null;
}): GuardResult {
	if (!params.skillTarget) {
		return { blocked: false };
	}

	const parsed = parseSkill(params.skillTarget);
	// ...
	if (params.state?.skillName) {
		// ...
	}
	return { blocked: false };
}
```

### Why it hurts
- Callers push validation downward instead of ensuring preconditions, turning callers into blind pass-throughs.
- Silent no-ops mask caller bugs: if a caller fails to parse a skill target or loses active runner state, the guard returns `{ blocked: false }` instead of failing fast or being rejected at compile time.
- Functions are cluttered with defensive checks (`if (!params.skillTarget)`, `params.state?.skillName`), degrading readability.
- The type system cannot guarantee invariants because the function signature permits `null`.

### Better
Require concrete, non-null types. The caller decides whether the operation applies; the domain function executes the logic without defensive boilerplate.

```typescript
export function guardSkillInvocation(params: {
	skillTarget: string;
	state: RunnerState;
}): GuardResult {
	const parsed = parseSkill(params.skillTarget);

	if (parsed?.namespace === "curtain" && parsed.name === "next") {
		return {
			blocked: true,
			reason:
				"BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
		};
	}

	const active = params.state.skillName.toLowerCase();
	const target = params.skillTarget.toLowerCase();
	if (
		target === active ||
		(parsed && (parsed.name === active || formatSkill(parsed) === active))
	) {
		return {
			blocked: true,
			reason:
				"BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke the active skill via the Skill tool. Execute the active step instructions directly.",
		};
	}

	return { blocked: false };
}

// Call site: clear intent, zero defensive guessing
if (skillTarget && ctx.state) {
	const guard = guardSkillInvocation({ skillTarget, state: ctx.state });
	if (guard.blocked) return codexToolDeny(guard.reason, ctx.state);
}
```

---

## 7. Modeling Harness Quirks in Domain Concepts (Reality vs. Semantics) (`[m3yr]`)

### Problem
Naming and modeling core domain actions after harness-specific implementation quirks or wire-level workarounds (such as `guardSkillFileRead`, `resolveSkillRead`, or treating `SKILL.md` view calls as file reads), rather than the universal domain semantics (**Skill Invocation**).

### What NOT to do
```typescript
// src/actions.ts: Domain action named after AGY's specific invocation mechanism
export function guardSkillFileRead(params: { skillName: string; state: RunnerState }): GuardResult { ... }
export function resolveSkillRead(params: { skillName: string; targetPath: string; ... }): SkillReadResult { ... }

// src/harnesses/agy.ts: Treating skill invocation as a file-reading concern
const readGuard = guardSkillFileRead({ skillName, state: ctx.state });
```

### Why it hurts
- **Pollutes the domain layer**: In Antigravity, agents read `SKILL.md` via `view_file` only because AGY lacks a native `Skill` tool or prompt hook. Naming domain actions `*SkillRead` models a harness quirk inside core domain logic.
- **Fragments identical semantics**: Other harnesses (Claude Code, Codex, Copilot) invoke skills via dedicated tools (`Skill({ skill })`) or slash commands. If domain actions are named after file reading, each harness ends up with its own duplicate action path (`guardSkillInvocation` vs `guardSkillFileRead`).
- **Conflates access control with lifecycle execution**: File access security (protecting `PLAYBOOK.md` backstage scripts from model inspection) is a file-reading concern. In contrast, starting Act 1 or resuming Act 2 on `next` is **Skill Invocation**, not a file read.

### Better
Model domain actions strictly by **universal semantics**, not harness reality. Harness adapters translate harness-specific realities (e.g. `view_file` on `SKILL.md` in AGY, or `Skill` tool calls in Codex) into clean, shared domain actions.

```typescript
// In src/actions.ts: Universal semantic action, independent of harness reality
export function resolveSkillInvocation(params: {
	skillName: string;
	state: RunnerState | null;
	workspacePaths: readonly string[];
	harness: HarnessType;
	skillPath?: string;
}): SkillInvocationResult {
	if (params.skillName === "next") {
		if (!params.state) {
			return {
				action: "block",
				message: "BLOCKED BY CURTAIN: No script is currently loaded.",
				nextState: null,
			};
		}
		const res = resumePlaybook(params.state);
		if (res.action === "error") {
			return {
				action: "block",
				message: res.message,
				nextState: res.nextState,
			};
		}
		return {
			action: "resume",
			message: res.message,
			nextState: res.nextState,
		};
	}

	if (params.state) {
		const guard = guardSkillInvocation({
			skillTarget: params.skillName,
			state: params.state,
		});
		if (guard.blocked) {
			return {
				action: "block",
				message: guard.reason,
				nextState: params.state,
			};
		}
		return { action: "pass", nextState: params.state };
	}

	const script = loadSkillScript(
		{ name: params.skillName, path: params.skillPath },
		params.workspacePaths,
		params.harness,
	);
	if (script) {
		const res = startPlaybook(script, params.skillName);
		return {
			action: "start",
			message: res.message,
			nextState: res.nextState,
		};
	}

	return { action: "pass", nextState: null };
}

// In src/harnesses/agy.ts: Adapter translates AGY wire reality (view_file on SKILL.md) to domain semantics
const skillName = resolveSkillNameFromPath(targetPath);
if (skillName) {
	const outcome = resolveSkillInvocation({
		skillName,
		skillPath: targetPath,
		state: ctx.state,
		workspacePaths: event.workspacePaths,
		harness: "agy",
	});
	if (outcome.action === "start" || outcome.action === "resume" || outcome.action === "block") {
		return agyResult("deny", outcome.nextState, outcome.message);
	}
	return agyResult("allow", outcome.nextState);
}

// In src/harnesses/codex.ts: Adapter translates Codex wire reality (Skill tool call) to the exact same domain action
const skillName = extractSkillTarget(toolCall);
if (skillName) {
	const outcome = resolveSkillInvocation({
		skillName,
		state: ctx.state,
		workspacePaths: event.workspacePaths,
		harness: "codex",
	});
	// map outcome to codex egress
}
```

---

## Summary Comparison

| Issue | Anti-Pattern | Desired Architecture |
|---|---|---|
| **Detection (`[ttpx]`)** | 5-part Boolean chain with substring heuristics | Single authoritative indicator (`env.CODEX_SESSION_ID`) |
| **Workspace (`[h7qy]`)** | Chained fallback array guessing alien schema fields | Read platform's native field (`payload.cwd`) directly |
| **Casing (`[szyu]`)** | Inline ternary cascades for snake vs camel | Direct read of platform standard with schema assertion |
| **Policies (`[qtvr]`)** | Copy-pasting prompt strings and guard logic into adapters | Pure policy functions in `src/actions.ts` |
| **Payload handling (`[6u5w]`)** | Raw `Record<string, unknown>` sifting inside `handle` | Discriminated union parsed at adapter boundary |
| **Parameters (`src/actions.ts:284`)** | Permissive `string \| null` or optional parameters | Strict non-null parameters; callers ensure preconditions |
| **Semantics vs Reality (`[m3yr]`)** | Modeling harness wire quirks (`*SkillRead`) in domain actions | Pure semantic actions (`resolveSkillInvocation`); adapters translate reality to semantics |

