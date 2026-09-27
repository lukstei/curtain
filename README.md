<img src="assets/logo.png" alt="Curtain logo" width="150" />

# curtain

> **Nobody likes spoilers, especially agents.**  
> Show them the ending and they skip the plot. Curtain keeps the script backstage until it's time to act.

[![CI](https://github.com/lukstei/curtain/actions/workflows/ci.yml/badge.svg)](https://github.com/lukstei/curtain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/@lukstei/curtain.svg)](https://www.npmjs.com/package/@lukstei/curtain)

Physical token withholding for AI coding agent workflows.
Executes multi-act Markdown playbooks one step at a time, keeping future instructions backstage until prior acts complete.

- [How it works](#how-it-works)
- [Features](#features)
- [FAQ](#faq)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authoring Playbooks](#authoring-playbooks)
- [Syntax & Delimiters](#syntax--delimiters)
- [Commands & Controls](#commands--controls)
- [Architecture](#architecture)
- [Development](#development)
- [Changelog](#changelog)
- [License](#license)

## How it works

When an AI coding agent receives a multi-step task in a single prompt or file, it attempts to execute the entire plan at once: skipping tests, hallucinating downstream phases, cutting corners, and bypassing review gates.

Prompting cannot prevent this. If future tokens exist in the context window, the model attends to them.

Curtain enforces physical token withholding across a four-step lifecycle:

```
[ User invokes /db-migrate ]
              │
              ▼
┌─────────────────────────────┐
│ Act 1: Schema & Draft SQL   │ ◄── Only Act 1 tokens enter context
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   > [!INTERMISSION] Gate    │ ◄── Turn stops. Control yields to user.
└─────────────┬───────────────┘
              │
     [ User enters /next ]
              │
              ▼
┌─────────────────────────────┐
│ Act 2: Local Verification   │ ◄── Act 2 tokens injected
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│    > [!CURTAIN] Advance     │ ◄── Turn completes. Next act begins immediately.
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Act 3: Cleanup & Docs       │ ◄── Act 3 tokens injected
└─────────────────────────────┘
```

### 1. Structure instructions into Acts
Convert an existing skill with `/curtain-adopt <skill>`, or write a playbook in `PLAYBOOK.md` using callout delimiters to separate sequential phases:

```markdown
# Database Migration

## Act 1: Schema Audit & Draft Migration
Audit existing tables in `src/db/schema.ts`. Write a migration script in `migrations/002_user_prefs.sql`.
Do not apply the migration yet.

> [!INTERMISSION] Review migration SQL
> Ensure all columns have default values and no destructive DROP operations exist.

## Act 2: Local Verification
Run the migration script against local test Postgres. Run the test suite to check for regressions.

> [!CURTAIN] Continue automatically to cleanup

## Act 3: Cleanup & Documentation
Update ORM models, export types, and update schema docs in `docs/db.md`.
```

### 2. Invoke the skill in chat
Trigger the workflow via its slash command (e.g. `/db-migrate`). Curtain intercepts the prompt, resolves `PLAYBOOK.md`, and injects Act 1 into the agent's context.

The agent prompt receives only the active instructions:

```text
[STEP 1 OF 3]
Audit existing tables in src/db/schema.ts. Write a migration script in migrations/002_user_prefs.sql.
Do not apply the migration yet.

[INTERMISSION CRITERIA]
Review migration SQL. Ensure all columns have default values and no destructive DROP operations exist.
```

Downstream instructions for Act 2 and Act 3 remain on disk and do not exist in the context window.

### 3. Review at an intermission
When the agent finishes drafting the migration, it concludes its turn. Curtain's `Stop` hook detects the `> [!INTERMISSION]` delimiter, sets the runner status to `paused`, and yields control to the user.

If you send chat messages or request changes during an intermission, Curtain appends `[INTERMISSION REVIEW]` instructions to ensure the agent addresses your feedback without advancing.

### 4. Advance with `/next`
When satisfied with the changes, type `/next` (Codex: `$curtain:next`). Curtain advances the step pointer and injects Act 2.

When Act 2 completes, its concluding `> [!CURTAIN]` delimiter triggers an automatic advance. The `Stop` hook intercepts turn completion, supplies Act 3 immediately, and lets the agent finish the workflow without manual confirmation.

## Features

- **[Physical token withholding](#how-does-physical-token-withholding-work):** Injects only the active Act into the prompt. Downstream steps do not exist in the context window.
- **[Intermission review gates](#how-do-review-gates-work-during-an-intermission):** Pauses execution at `> [!INTERMISSION]` delimiters, yielding control to the user and replaying criteria on feedback turns.
- **Autonomous act advancement:** Delimiters (`> [!CURTAIN]`) raise the curtain and feed the next Act immediately upon turn completion.
- **[Zero schema overhead](#syntax--delimiters):** Standard Markdown playbooks parsed by a generic AST tokenizer without complex YAML workflow configs.
- **[Backstage file protection](#can-an-agent-bypass-curtain-or-read-future-acts):** Intercepts file-reading tools and runner commands to prevent agents from peeking backstage at `PLAYBOOK.md`.
- **[Universal environment support](#how-does-curtain-run-across-different-agent-environments):** Shared single-source architecture supporting Google Antigravity, Anthropic Claude Code, and OpenAI Codex.
- **[Skill adoption and ejection](#quick-start):** Built-in skills to migrate single-file skills into playbooks (`/curtain-adopt`) and reverse them cleanly (`/curtain-eject`).
- **Zero-dependency bundled shim:** Packaged into a single ESM file (`dist/curtain.mjs`) executed directly by host harness hooks without `npm install`.

## FAQ

<details>
<summary><a id="how-does-physical-token-withholding-work"></a><strong>How does physical token withholding work?</strong></summary>

Standard prompting tells the model: "Execute Step 1, then wait for approval before running Step 2."

This instruction frequently fails. Because all steps reside in the context window, the model attends to future instructions. It rushes ahead, prepares artifacts for subsequent phases, combines steps, or skips verification commands to reach the finish line sooner.

Curtain replaces prompt instructions with physical isolation. Playbooks stay on disk in `PLAYBOOK.md`. Curtain's lifecycle hooks intercept the agent's prompt submission (`PreInvocation`) and turn completion (`Stop`), managing execution state via a local JSON file keyed by session ID.

At any given turn, only the text of the active Act enters the prompt. Because future tokens do not exist in the context window, the model cannot attend to them or plan ahead.

</details>

<details>
<summary><a id="why-not-put-playbooks-directly-in-skill-md"></a><strong>Why not put multi-act playbooks directly in SKILL.md?</strong></summary>

Agent harnesses (Claude Code, Google Antigravity, OpenAI Codex) treat `SKILL.md` as public prompt context. When a user runs a slash command, the harness injects the entire file into turn 1.

If Act 1, Act 2, and Act 3 reside in `SKILL.md`, the full script enters context on the very first turn. A runner hook injecting `[STEP 1 OF 3]` cannot hide instructions the harness already displayed.

Curtain separates public metadata from execution scripts:
- `SKILL.md`: Public entry point loaded by the harness. It instructs the agent to follow injected prompt instructions and forbids inspecting local files.
- `PLAYBOOK.md`: The backstage multi-act script. It is withheld by Curtain and injected step by step.

</details>

<details>
<summary><a id="how-do-review-gates-work-during-an-intermission"></a><strong>How do review gates work during an intermission?</strong></summary>

When an Act ends with `> [!INTERMISSION]`, Curtain's `Stop` hook allows the agent to conclude its turn and yield control to the user. The session enters `paused` status.

During an intermission:
1. The user inspects code, runs local checks, or replies with feedback in chat.
2. If the user sends a chat message, Curtain intercepts it and appends `[INTERMISSION REVIEW]` instructions reminding the agent to resolve the feedback and conclude its turn.
3. The agent cannot advance to the next Act on its own.
4. Only entering `/next` (Codex: `$curtain:next`) advances the step pointer, sets status to `running`, and injects the next Act.

</details>

<details>
<summary><a id="can-an-agent-bypass-curtain-or-read-future-acts"></a><strong>Can an agent bypass Curtain or read future acts?</strong></summary>

An agent might attempt to read `PLAYBOOK.md` using file-reading tools (`view_file`, `cat`, `ReadFile`) or call runner commands via tool invocations.

Curtain blocks these attempts:
- Pre-tool hooks intercept file-reading tools targeting `PLAYBOOK.md` or any skill directory containing active playbooks, denying access before the tool executes.
- Tool hooks block calls attempting to invoke runner skills (`curtain:next` or active skill tools) directly from the model.
- Downstream tokens remain on disk; the agent prompt contains only the current Act.

</details>

<details>
<summary><a id="how-does-curtain-run-across-different-agent-environments"></a><strong>How does Curtain run across different agent environments?</strong></summary>

Harnesses differ in lifecycle event names, wire payloads (JSON vs protojson), property casing (`snake_case` vs `camelCase`), and egress formats:
- **Google Antigravity:** Dispatches events via `.agents/plugins/curtain/hooks.json`. Normalizes `UserPromptSubmit` and `view_file` events.
- **Anthropic Claude Code:** Declares hooks in `hooks/claude-codex-hooks.json`. Uses `UserPromptSubmit`, `Stop`, and `PreToolUse`.
- **OpenAI Codex:** Uses `snake_case` payloads and process exit code signaling (`exit 2` for tool block decisions).

Curtain provides dedicated adapters in `src/harnesses/` that normalize wire payloads into strongly typed domain events and format egress output per platform specification. A single bundled executable (`dist/curtain.mjs`) handles execution across all environments.

</details>

## Installation

<details open>
<summary><b>Google Antigravity</b></summary>

```bash
agy plugin install https://github.com/lukstei/curtain
```

</details>

<details>
<summary><b>Claude Code</b></summary>

From your terminal:
```bash
claude plugin marketplace add lukstei/curtain
claude plugin install curtain@curtain-marketplace
```

Or inside an active session:
```bash
/plugin marketplace add lukstei/curtain
/plugin install curtain@curtain-marketplace
```

</details>

<details>
<summary><b>OpenAI Codex</b></summary>

```bash
codex plugin marketplace add lukstei/curtain
codex plugin add curtain@curtain
```

</details>

## Quick Start

### 1. Adopt an existing skill (`/curtain-adopt`)
Convert any existing single-file skill into a multi-act playbook:

```bash
/curtain-adopt <skill-name-or-path>
```

Curtain automatically:
- Preserves original prose and headings verbatim without inventing artificial titles.
- Prunes redundant wait instructions (e.g. "Wait for user confirmation") handled natively by `> [!INTERMISSION]`.
- Prunes forward-context leaks (e.g. "In Step 3 we will apply...") rendered obsolete by physical token withholding.
- Strips Tables of Contents to prevent leaking future step names into Act 1 context.
- Inserts `> [!INTERMISSION]` at approval boundaries and `> [!CURTAIN]` at automatic section boundaries.
- Previews the proposed playbook in the review sidebar before writing `PLAYBOOK.md` and wrapping `SKILL.md`.

### 2. Run in chat
Invoke the adopted skill directly using its slash command:
- **Claude Code & AGY:** `/<skill-name>`
- **Codex:** `$<skill-name>`

When paused at an intermission, review the agent's work and resume with `/next` (Codex: `$curtain:next`).

> [!NOTE]
> - **Antigravity**: Antigravity executes skills by instructing the agent to read `SKILL.md` via `view_file`. Curtain intercepts any `view_file` call on a skill backed by a `PLAYBOOK.md` to begin Act 1. To inspect or edit a Curtain `SKILL.md` in Antigravity without triggering playbook execution, open the file directly in your editor.
> - **Codex**: Hook output is visible in chat until [openai/codex#25403](https://github.com/openai/codex/issues/25403) is resolved.

### 3. Eject anytime (`/curtain-eject`)
Restore an adopted playbook back to a standard single-file skill with zero lock-in:

```bash
/curtain-eject <skill-name-or-path>
```

- Recombines YAML frontmatter from `SKILL.md` with instructions from `PLAYBOOK.md`.
- Strips all `> [!CURTAIN]` and `> [!INTERMISSION]` callouts.
- Previews the restored `SKILL.md` in the review sidebar, deleting `PLAYBOOK.md` upon confirmation.

## Authoring Playbooks

To create a new multi-act skill from scratch without adopting an existing one:

### 1. Directory layout
Organize your workflow inside a skill directory with `SKILL.md` for manifest metadata and `PLAYBOOK.md` for instructions:

```text
.agents/skills/db-migrate/  (or .claude/skills/db-migrate/)
├── SKILL.md       # Public skill manifest
└── PLAYBOOK.md    # Backstage multi-act script
```

### 2. Define the playbook
In `PLAYBOOK.md`, separate sequential phases using callout alert delimiters:

```markdown
# Database Migration

## Act 1: Schema Audit & Draft Migration
Audit existing tables in `src/db/schema.ts`. Write a migration script in `migrations/002_user_prefs.sql`.
Do not apply the migration yet.

> [!INTERMISSION] Review migration SQL
> Ensure all columns have default values and no destructive DROP operations exist.

## Act 2: Local Verification
Run the migration script against local test Postgres. Run the test suite to check for regressions.

> [!CURTAIN] Continue automatically to cleanup

## Act 3: Cleanup & Documentation
Update ORM models, export types, and update schema docs in `docs/db.md`.
```

## Syntax & Delimiters

Playbooks are standard Markdown files divided into sequential Acts by GitHub-style callout blockquotes:

| Delimiter | Type | Behavior |
| :--- | :--- | :--- |
| `> [!CURTAIN]` | Automatic | Concludes the active Act. Intercepts turn completion via the `Stop` hook, raises the curtain, and feeds the next Act immediately. |
| `> [!INTERMISSION]` | Review Gate | Concludes the active Act. Pauses execution and yields control to the user. Feedback messages replay review criteria. Resumes on `/next`. |

### Delimiter criteria
Delimiters accept optional instructions:
- `> [!INTERMISSION] Criteria`: Injected as `[INTERMISSION CRITERIA]` during the step prompt, and replayed as `[INTERMISSION REVIEW]` during review turns.
- `> [!CURTAIN] Criteria`: Injected as `[TRANSITION CRITERIA]` during the step prompt.

Multi-line instructions are supported:

```markdown
> [!INTERMISSION] Review migration SQL
> - Ensure all columns have default values.
> - Confirm no destructive DROP operations exist.
```

### Grammar rules
- **Top-level callouts:** Delimiters must appear as top-level Markdown blockquotes.
- **Code block isolation:** Callout blockquotes inside fenced code blocks are ignored and never trigger act boundaries.
- **Case-insensitive:** Delimiters match case-insensitively (`> [!curtain]`, `> [!INTERMISSION]`).
- **Preamble support:** Any Markdown text before the first delimiter or heading is preserved as playbook preamble context.

## Commands & Controls

| Command (Claude Code / AGY) | Command (Codex CLI) | Description |
| :--- | :--- | :--- |
| `/<skill-name>` | `$<skill-name>` | Start execution of a multi-act skill. |
| `/next` | `$curtain:next` | Advance to the next Act when paused at an intermission. |
| `/curtain-adopt <skill>` | `$curtain-adopt <skill>` | Convert an existing single-file skill into a multi-act Curtain playbook. |
| `/curtain-eject <skill>` | `$curtain-eject <skill>` | Reverse an adopted playbook back into a standard single-file skill. |

## Architecture

Curtain uses a universal, single-source design where manifest zones, lifecycle adapters, and execution logic reside in a single repository:

```text
curtain/
├── .agents/plugins/curtain/          # Google Antigravity manifest & hooks
├── .claude-plugin/                   # Claude Code plugin manifest
├── .codex-plugin/                    # OpenAI Codex plugin manifest
├── hooks/
│   └── claude-codex-hooks.json       # Shared Claude & Codex hook declarations
├── skills/                           # Packaged skills (curtain-adopt, curtain-eject, next)
├── src/
│   ├── harnesses/                    # Adapters (agy.ts, claude.ts, codex.ts, copilot.ts)
│   ├── handlers/                     # Lifecycle handlers (pre.ts, stop.ts)
│   ├── parser/                       # Markdown AST act tokenizer
│   ├── resolver/                     # Skill & playbook path resolution
│   ├── state.ts                      # Disk state serialization (.curtain-state.json)
│   ├── transitions.ts                # Pure lifecycle state transitions
│   └── cli.ts                        # CLI entry point
└── dist/
    └── curtain.mjs                   # Zero-dependency bundled ESM production shim
```

## Development

```bash
npm install
npm run verify      # Runs tests, linter, and typecheck
npm run build       # Builds dist/curtain.mjs
npm run test:watch  # Runs test watcher
```

## Changelog

See [CHANGELOG](docs/CHANGELOG.md) for release history and notable changes.

## License

[MIT](LICENSE) © 2026 Lukas Steinbrecher
