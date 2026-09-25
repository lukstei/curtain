# Code Smells & Remediation Checklist

This document organizes Curtain's architectural debt, anti-patterns, and code smells into a 4-phase dependency-ordered execution plan, with bare intermission review gates after every checklist item.

---

# Phase 1: Foundation & Boundary Contracts

Foundational primitives, canonical ingress types, and discriminated egress unions. Must be established first so downstream handler refactoring does not require throwaway code or multiple snapshot updates.

---

## 1. Duplicate Argument Stripping & Redundant Regular Expressions (Smell 9)

### Description
`parseCommand.ts` and `resolver.ts` implement separate routines to strip `@`, quotes, and brackets, backed by redundant regex definitions.

### Why It Is Bad
- Duplicate logic creates maintenance overhead and behavior drift.
- Unnecessary regex proliferation (`FILE_BRACKET_REGEX` vs `RESOLVER_BRACKET_REGEX`).

### Best Practice
**Single Source of Truth.** Provide a single path sanitization helper and reuse it across command parsing and script resolution.

### Locations
- [`src/lib/parseCommand.ts:L19-L33`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/lib/parseCommand.ts#L19-L33): `parseFilePath`
- [`src/resolver.ts:L12-L24`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/resolver.ts#L12-L24): `resolveScriptPath`
- [`src/regex.ts:L55-L68`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/regex.ts#L55-L68): duplicate bracket and quote regexes

### Checklist
- [ ] Extract `cleanFilePathArgument(raw: string): string | null` into `src/lib/parseCommand.ts`
- [ ] Use `cleanFilePathArgument` in `src/resolver.ts`
- [ ] Remove redundant regexes (`RESOLVER_BRACKET_REGEX`, `RESOLVER_QUOTE_REGEX`) from `src/regex.ts`

> [!INTERMISSION]

---

## 2. Input Indirection & Semantic Ambiguity in `HookInfo` (Smell 5)

### Description
`HookInfo` carries both `prompt: string` and `latestMessage?: LatestMessage | null`. `handlePre` checks `latestMessage.type === "USER_INPUT"` first and falls back to `prompt`. Meanwhile, `common.ts` sets `prompt` from `latestMessage`. `handleStop` receives `latestMessage` but never reads it.

### Why It Is Bad
- Unclear single source of truth for user input text.
- Carrying dead payload fields through stop hooks.

### Best Practice
**Normalize at Ingress.** The normalization boundary should produce a single authoritative `prompt: string`. Handlers consume the clean string directly.

### Locations
- [`src/types.ts:L23-L32`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/types.ts#L23-L32): `PreHookInfo` and `StopHookInfo` definitions
- [`src/harnesses/common.ts:L180`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/harnesses/common.ts#L180): `prompt` assignment fallback
- [`src/handlers/pre.ts:L50-L53`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L50-L53): conditional check in `handlePre`
- [`src/handlers/stop.ts`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/stop.ts): unused `latestMessage`

### Checklist
- [ ] Ensure harness normalizers provide a canonical `prompt: string`
- [ ] Remove `latestMessage` from `PreHookInfo` in `src/types.ts`
- [ ] Remove unused `latestMessage` from `StopHookInfo` in `src/types.ts`
- [ ] Update `handlePre` to use `info.prompt` directly

> [!INTERMISSION]

---

## 3. Bag-of-Optionals Anti-Pattern in Hook Interfaces (Smell 4)

### Description
`HookResponse` aggregates mutually exclusive fields (`decision`, `reason`, `injectSteps`) into a flat object where every field is optional.

### Why It Is Bad
- Allows illegal states at compile time (e.g. tool hooks returning `injectSteps`).
- Forces every harness adapter to write defensive conditionals checking which optional property exists.
- Leaks Antigravity's egress schema (`injectSteps: [{ ephemeralMessage }]`) to other harness adapters.

### Best Practice
**Make Illegal States Unrepresentable.** Model response types as discriminated unions matching the specific hook phase (`pre`, `stop`, `tool`).

### Locations
- [`src/types.ts:L41-L45`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/types.ts#L41-L45): `HookResponse` definition
- [`src/handlers/pre.ts:L25-L28`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L25-L28): `HandlerResult` definition
- [`src/handlers/stop.ts:L5`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/stop.ts#L5): stop handler return typing
- [`src/handlers/tool.ts:L6`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/tool.ts#L6): tool handler return typing
- [`src/harnesses/claude.ts:L108-L140`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/harnesses/claude.ts#L108-L140): egress formatting
- [`src/harnesses/agy.ts:L240-L285`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/harnesses/agy.ts#L240-L285): egress formatting
- [`src/harnesses/codex.ts:L210-L250`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/harnesses/codex.ts#L210-L250): egress formatting
- [`src/harnesses/copilot.ts:L124-L170`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/harnesses/copilot.ts#L124-L170): egress formatting
- [`src/harnesses/types.ts:L50`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/harnesses/types.ts#L50): `formatEgress` interface

### Checklist
- [ ] Define `PreHookResponse` (`inject` | `pass`), `StopHookResponse` (`allow` | `continue`), and `ToolHookResponse` (`allow` | `deny`) in `src/types.ts`
- [ ] Type `handlePre` to return `PreHookResponse`
- [ ] Type `handleStop` to return `StopHookResponse`
- [ ] Type `handlePreTool` to return `ToolHookResponse`
- [ ] Update `formatEgress` in all 4 harness adapters to match on the discriminated union

> [!INTERMISSION]

---

## 4. State Schema Explicit Skill Tracking (Smell 6a)

### Description
`RunnerState` does not store the skill name when a script is invoked via a skill, forcing downstream components to guess it from directory paths.

### Why It Is Bad
- Downstream security tools rely on `path.dirname` heuristics.

### Best Practice
**Explicit Domain State.** Persist the explicit skill name in runner state if one was launched.

### Locations
- [`src/state.ts:L8-L13`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/state.ts#L8-L13): `RunnerState` definition
- [`src/transitions.ts:L18-L27`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/transitions.ts#L18-L27): `startExecution`

### Checklist
- [ ] Add optional `skillName?: string` to `RunnerState` in `src/state.ts`
- [ ] Update `startExecution` in `src/transitions.ts` to accept optional `skillName?: string`

> [!INTERMISSION]

---

# Phase 2: Pure Handlers & Dispatcher

With boundary types and state models stable, decouple handlers from the filesystem and turn them into pure in-memory state machines.

---

## 5. Ghost State & Leaky State Persistence (Smell 1)

### Description
Handlers declare a pure function signature returning `{ state, response }`, but perform side-effecting disk I/O (`saveState`, `deleteState`) internally. Meanwhile, the outer runtime shim discards the returned `state`.

### Why It Is Bad
- Violates the Single Responsibility Principle and confuses callers about state ownership.
- Prevents testing handlers in-memory without mock filesystems or temporary directories.
- Forces passing `process.env` throughout pure domain routing logic solely to construct storage paths.

### Best Practice
**Functional Core, Imperative Shell.** Handlers must be pure functions accepting `(info, state)` and returning `{ nextState, response }`. The outer execution boundary (`runtime-shim`, `cli`) is exclusively responsible for reading and writing state to disk.

### Locations
- [`src/handlers/pre.ts:L36`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L36): `saveState` inside `startScript`
- [`src/handlers/pre.ts:L87`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L87): `deleteState` on finish in `handlePre`
- [`src/handlers/pre.ts:L96`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L96): `saveState` on resume in `handlePre`
- [`src/handlers/stop.ts:L30`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/stop.ts#L30): `deleteState` on finish in `handleStop`
- [`src/handlers/stop.ts:L35`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/stop.ts#L35): `saveState` on pause in `handleStop`
- [`src/handlers/stop.ts:L39`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/stop.ts#L39): `saveState` on auto-advance in `handleStop`
- [`src/shim/runtime-shim.ts:L60`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/shim/runtime-shim.ts#L60): caller ignores returned `state`
- [`src/cli.ts:L118`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/cli.ts#L118): `deleteState` on finish
- [`src/cli.ts:L124`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/cli.ts#L124): `saveState` on resume
- [`src/cli.ts:L145`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/cli.ts#L145): `saveState` on start

### Checklist
- [ ] Remove `saveState` and `deleteState` calls from `src/handlers/pre.ts`
- [ ] Remove `saveState` and `deleteState` calls from `src/handlers/stop.ts`
- [ ] Remove `env: NodeJS.ProcessEnv` parameter from `handlePre`, `handleStop`, and `handle`
- [ ] Move state persistence diffing into `src/shim/runtime-shim.ts` (`deleteState` when nextState is null, `saveState` when nextState changes)
- [ ] Strip disk fixtures (`AGY_PLUGIN_DATA`) from `src/handlers/pre.test.ts` and `src/handlers/stop.test.ts`

> [!INTERMISSION]

---

## 6. Handler Signature Inconsistency & Exhaustiveness (Smell 10)

### Description
`handle(info, state, env)` passes `env` to `handlePre` and `handleStop` but not `handlePreTool`. It casts `info` to `{ type?: unknown }` to throw on unknown types.

### Why It Is Bad
- Incoherent handler abstraction and dead parameters.
- Weakens TypeScript type safety by casting to `unknown`.

### Best Practice
**Uniform Pure Dispatcher.** All handlers share a consistent signature `(info, state) => Result`. Use exhaustive switch checking (`assertNever`) instead of runtime casting.

### Locations
- [`src/handlers/index.ts:L11-L26`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/index.ts#L11-L26): dispatcher signature and type casting

### Checklist
- [ ] Update `handle` signature to `(info: HookInfo, state: RunnerState | null): HookResult`
- [ ] Remove `env` argument from `handle` and sub-handler calls
- [ ] Replace `(info as { type?: unknown }).type` throw with compile-time exhaustiveness check (`assertNever`)

> [!INTERMISSION]

---

## 7. Exact Canonical Playbook & Skill Guard in `tool.ts` (Smell 6b)

### Description
`tool.ts` extracts `activeSkillName` using `path.basename(path.dirname(state.script))`. It also blocks any read targeting a file named `PLAYBOOK.MD` anywhere in the workspace.

### Why It Is Bad
- Fails when scripts do not reside inside a directory matching the skill name.
- Falsely blocks reading unrelated playbooks located in other workspace directories.

### Best Practice
**Explicit Identification & Precise Path Matching.** Use `state.skillName`. Restrict file-read blocking to exact canonical matches with the active script.

### Locations
- [`src/handlers/tool.ts:L42-L44`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/tool.ts#L42-L44): `path.dirname` extraction
- [`src/handlers/tool.ts:L72-L74`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/tool.ts#L72-L74): workspace-wide `PLAYBOOK.MD` check
- [`src/handlers/tool.ts:L8-L15`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/tool.ts#L8-L15): synchronous `fs.realpathSync` in `isSameFile`

### Checklist
- [ ] In `src/handlers/tool.ts`, replace `path.dirname` extraction with `state.skillName`
- [ ] Remove workspace-wide `PLAYBOOK.MD` basename block; check only `isSameFile(readTargetFilePath, state.script)`
- [ ] Optimize `isSameFile` with fast string comparison before falling back to `realpathSync`

> [!INTERMISSION]

---

# Phase 3: Parsing & Lifecycle Orchestration

Unify command parsing and domain lifecycle execution across CLI and handlers.

---

## 8. Split-Brain Input Parsing & Redundant Regex Passes (Smell 2)

### Description
Command parsing and skill invocation detection are split between `parseCommand.ts` and `pre.ts`. If `parseCommand` returns `isCurtainCommand: false`, `pre.ts` executes a second regex pass matching skill links and commands.

### Why It Is Bad
- Runs the same regular expressions multiple times on each turn.
- Scatters command detection rules across files, increasing drift risk.

### Best Practice
**Parse, Don't Validate.** Transform raw input once at the system boundary into a strongly-typed domain intent (`UserIntent`). Handlers switch on the resulting intent without inspecting raw strings.

### Locations
- [`src/lib/parseCommand.ts:L51`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/lib/parseCommand.ts#L51): `trimmed.match(COMMAND_REGEX)`
- [`src/lib/parseCommand.ts:L105`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/lib/parseCommand.ts#L105): `trimmed.match(SKILL_LINK_WITH_OPTIONAL_PATH_REGEX)`
- [`src/handlers/pre.ts:L55`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L55): invocation of `parseCommand`
- [`src/handlers/pre.ts:L123-L142`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L123-L142): second regex pass on `SKILL_LINK_WITH_OPTIONAL_PATH_REGEX` and `BARE_SKILL_COMMAND_REGEX`

### Checklist
- [ ] Define `UserIntent` discriminated union in `src/lib/parseCommand.ts` (`next`, `run`, `skill`, `none`, `error`)
- [ ] Move skill link and bare command parsing into `src/lib/parseCommand.ts`
- [ ] Remove duplicate regex matching in `src/handlers/pre.ts:L123-L142`
- [ ] Update `handlePre` to branch on `UserIntent` directly

> [!INTERMISSION]

---

## 9. Duplicate Runner Orchestration Between CLI and Pre Handler (Smell 3)

### Description
The steps for starting and resuming execution (validating state, invoking transitions, formatting prompts, handling completions, handling errors) are written independently in `src/cli.ts` and `src/handlers/pre.ts`.

### Why It Is Bad
- Violates DRY; changes to step prompts or error messages must be updated in multiple files.
- Creates divergent behavior between interactive agent runs and terminal CLI executions.

### Best Practice
**Reusable Domain Operations.** Centralize lifecycle workflows in pure transition functions in `src/transitions.ts`. CLI and hook handlers consume the same workflow steps.

### Locations
- [`src/cli.ts:L102-L128`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/cli.ts#L102-L128): resuming execution on `next`
- [`src/handlers/pre.ts:L76-L101`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L76-L101): resuming execution on `/next`
- [`src/cli.ts:L134-L150`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/cli.ts#L134-L150): starting execution on `curtain <file>`
- [`src/handlers/pre.ts:L30-L43`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L30-L43) & [`src/handlers/pre.ts:L104-L116`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L104-L116): starting execution on `/curtain run`

### Checklist
- [ ] Define `executeStart(script: Script, skillName?: string)` in `src/transitions.ts` returning `{ nextState, message }`
- [ ] Define `executeResume(state: RunnerState)` in `src/transitions.ts` returning `{ action, nextState, message }`
- [ ] Refactor `src/cli.ts` to call `executeResume` and `executeStart`
- [ ] Refactor `src/handlers/pre.ts` to call `executeResume` and `executeStart`

> [!INTERMISSION]

---

## 10. Direct Synchronous Filesystem Coupling in Pure Routing Paths (Smell 7)

### Description
`handlePre` chains multiple synchronous file reads, directory scans, and callout regex checks during hook evaluation.

### Why It Is Bad
- Tightly couples routing decisions to the filesystem.
- Slows down turn processing with deep synchronous directory traversal.

### Best Practice
**Facade / Isolated Loader.** Encapsulate script and playbook resolution behind a single loader function. The handler coordinates using the returned script object.

### Locations
- [`src/handlers/pre.ts:L143-L157`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/handlers/pre.ts#L143-L157): multi-step `fs` lookups in `handlePre`
- [`src/lib/resolveSkill.ts:L20-L71`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/lib/resolveSkill.ts#L20-L71): recursive directory traversal

### Checklist
- [ ] Encapsulate skill lookup and annotation checks into `loadSkillScript(target, workspacePath, harness)`
- [ ] Replace inline `fs` calls in `src/handlers/pre.ts` with the single loader call

> [!INTERMISSION]

---

# Phase 4: Diagnostics & Hardening

---

## 11. Broad Try-Catch Blocks Swallowing Diagnostic Failures (Smell 8)

### Description
Silent `catch { return null; }` and empty `catch { }` blocks in `state.ts`, `resolveSkill.ts`, and `getLatestMessage.ts` swallow unexpected filesystem and JSON errors.

### Why It Is Bad
- Corrupted state files or permission errors silently appear as "no script running", hiding defects.

### Best Practice
**Targeted Error Handling.** Only catch expected errors (e.g. `ENOENT` for optional files). Log or surface unexpected errors (`EACCES`, `SyntaxError`) to debug logs.

### Locations
- [`src/state.ts:L65-L67`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/state.ts#L65-L67): swallowed read errors in `loadState`
- [`src/state.ts:L92-L94`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/state.ts#L92-L94): swallowed unlink errors in `deleteState`
- [`src/lib/resolveSkill.ts:L14`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/lib/resolveSkill.ts#L14): swallowed error in `hasCurtainAnnotations`
- [`src/lib/resolveSkill.ts:L66-L68`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/lib/resolveSkill.ts#L66-L68): swallowed directory read errors
- [`src/lib/getLatestMessage.ts:L54-L60`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/lib/getLatestMessage.ts#L54-L60): swallowed parse and read errors
- [`src/shim/stdin.ts:L14`](file:///Users/Lukas.Steinbrecher/dev/curtain/src/shim/stdin.ts#L14): swallowed JSON parse errors

### Checklist
- [ ] In `src/state.ts:L65`, distinguish `ENOENT` from `SyntaxError` / `EACCES`; log unexpected errors via `logDebug`
- [ ] In `src/state.ts:L92`, log non-`ENOENT` unlink failures via `logDebug`
- [ ] In `src/lib/resolveSkill.ts:L66`, log directory read errors in debug mode
- [ ] In `src/shim/stdin.ts:L14`, log parse failures when input is non-empty

> [!INTERMISSION]
