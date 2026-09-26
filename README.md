# curtain

> **Nobody likes spoilers, especially agents.**  
> Show them the ending and they skip the plot. Curtain keeps the script backstage until the curtain rises.

[![CI](https://github.com/lukstei/curtain/actions/workflows/ci.yml/badge.svg)](https://github.com/lukstei/curtain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/@lukstei/curtain.svg)](https://www.npmjs.com/package/@lukstei/curtain)

When you give an AI coding agent a multi-phase task in a single prompt or file, it attempts to execute the entire plan at once: skipping tests, hallucinating downstream phases, cutting corners, and blowing past human review gates.

**Prompting does not fix this.** If tokens exist in the context window, the model can and will attend to them.

**Curtain** solves this by physically withholding future instructions from the context window:
- Works directly with your existing skills: divide any `SKILL.md` or markdown playbook into **Acts**.
- The agent only ever receives the text for the **current Act**.
- Between Acts hangs a **curtain**.
- An agent physically cannot skip ahead because downstream tokens do not exist in its prompt window.

Works across Google Antigravity, Claude Code, and OpenAI Codex.

## Installation

<details>
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

## Quickstart

### 1. Create a skill directory

Organize your workflow inside a skill directory with `SKILL.md` for metadata and `PLAYBOOK.md` for instructions:

```
.agents/skills/db-migrate/  (or .claude/skills/db-migrate/)
├── SKILL.md       # Public skill manifest
└── PLAYBOOK.md    # Backstage multi-act script
```

In `PLAYBOOK.md`, separate your acts using GitHub-style callouts:

```markdown
# Database Migration

## Act 1: Schema Audit & Draft Migration
Audit existing tables in `src/db/schema.ts`. Write a non-destructive migration script in `migrations/002_user_prefs.sql`.
Do not apply the migration yet.

> [!INTERMISSION] Review migration SQL
> Ensure all columns have default values and no destructive DROP operations exist.

## Act 2: Local Verification
Run the migration script against local test Postgres container. Run existing test suite to check for regressions.

> [!CURTAIN] Continue automatically to cleanup

## Act 3: Cleanup & Documentation
Update the ORM models and export types. Update schema docs in `docs/db.md`.
```

### 2. Run in chat

Invoke the skill directly via its natural command:
- **Claude Code & AGY:** `/db-migrate`
- **Codex:** `$db-migrate`

When paused at an intermission, resume with `/next` (Codex: `$curtain:next`).

## Syntax & Delimiters

Skills and playbooks are standard Markdown files separated by GitHub-style callout alert blockquotes:

| Delimiter | Type | Behavior |
| :--- | :--- | :--- |
| `> [!CURTAIN]` | Automatic | Delimiter concluding the active Act. Intercepts turn completion via the `Stop` hook, raises the curtain, and feeds the next Act immediately. |
| `> [!INTERMISSION]` | Intermission Gate | Intermission concluding the active Act. Pauses execution and yields control to the developer for review. Feedback messages replay the intermission criteria. Resume with `/next`. |

Delimiters support optional instructions:
- `> [!INTERMISSION] Criteria` formats as `[INTERMISSION CRITERIA]` and replays as `[INTERMISSION REVIEW]` during review turns.
- `> [!CURTAIN] Criteria` formats as `[TRANSITION CRITERIA]`.

## Commands & Controls

| Command (Claude / AGY) | Command (Codex CLI) | Description |
| :--- | :--- | :--- |
| `/<skill-name>` | `$<skill-name>` | Start execution of a multi-act skill. |
| `/next` | `$curtain:next` | Advance to the next Act when paused at an intermission. |

## Development

```bash
npm install
npm run verify      # runs tests, linter, and typecheck
npm run build       # builds dist/curtain.cjs
npm run test:watch  # test watcher
```

## Changelog

See [CHANGELOG](docs/CHANGELOG.md) for release history and notable changes.

## License

[MIT](LICENSE) © 2026 Lukas Steinbrecher
