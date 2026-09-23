# Curtain Playbook Syntax Specification (`curtain`)

This document specifies the Markdown grammar, structure, and execution rules for `@lukstei/curtain` instruction playbooks.

---

## 1. Overview & Principles

Unlike complex DAG workflow engines that require YAML frontmatter and heavy schema validation, **Curtain** leverages a generic Markdown AST:

- **Zero Schema Overhead:** Any valid Markdown file can be executed as a playbook.
- **Act Isolation:** Scripts are segmented into sequential **Acts** separated by explicit curtain delimiters.
- **Physical Token Withholding:** The host runner injects only the active Act into the agent's context window. Future instructions do not exist in the prompt, rendering skip-ahead physically impossible.

---

## 2. Curtain Delimiters

Acts are bounded by GitHub-style callout alert blockquotes:

| Delimiter | Type | Behavior |
| :--- | :--- | :--- |
| `> [!CURTAIN]` | Automatic Transition | Delimiter concluding the active Act. Intercepts turn conclusion via the `Stop` hook and automatically feeds the next Act without waiting for user confirmation. |
| `> [!INTERMISSION]` | Intermission Gate | Intermission for human-in-the-loop review concluding the active Act. The `Stop` hook permits the agent to stop its turn and report back. The next Act is only injected when the developer enters `/next`. |

### Grammar Rules

1. **Callout Alert Format:** Delimiters appear as top-level Markdown blockquotes matching GitHub callout alert syntax:
   ```markdown
   > [!CURTAIN]
   ```
   or
   ```markdown
   > [!INTERMISSION]
   ```
2. **Case Insensitivity & Whitespace:** Delimiters are case-insensitive (`> [!INTERMISSION]`, `> [!curtain]`) and allow variable internal spacing (`>   [!CURTAIN]   `).
3. **Delimiter Instructions:** Delimiters can include optional criteria and review instructions:
   - Single line:
     ```markdown
     > [!INTERMISSION] Verify all database migrations run cleanly without errors.
     ```
   - Multi-line:
     ```markdown
     > [!INTERMISSION] Review carefully
     > - Ensure schema migrations apply cleanly.
     > - Verify test suite coverage does not drop.
     ```
   - Instructions on `> [!INTERMISSION]` are injected as `[INTERMISSION CRITERIA]` during the step prompt, and replayed as `[INTERMISSION REVIEW]` on user feedback turns while paused.
   - Instructions on `> [!CURTAIN]` are injected as `[TRANSITION CRITERIA]` during the step prompt.
4. **Fenced Code Block Isolation:** Callout alert blockquotes inside fenced code blocks are not top-level AST blocks and will never trigger step boundaries.
5. **Single-Act Fallback:** A Markdown document with no curtain delimiters is treated as a single Act of type `auto` and executes normally.

---

## 3. Playbook Structure

```markdown
# Database Migration Playbook

Optional playbook preamble or context placed before the first Act.

## Act 1: Schema Audit & Draft Migration
Audit existing tables in `src/db/schema.ts`.
Write a non-destructive migration script in `migrations/002_user_prefs.sql`.
Do not apply the migration yet.

> [!INTERMISSION] Review migration SQL
> Ensure all columns have default values and no destructive DROP operations exist.

## Act 2: Local Verification
Run the migration script against local test Postgres container.
Run existing test suite to check for regressions.

> [!CURTAIN] Continue automatically to cleanup

## Act 3: Cleanup & Documentation
Update the ORM models and export types.
Update schema docs in `docs/db.md`.
```

---

## 4. Execution Lifecycle

### Step 0: Ingestion
- Ingested via `/curtain <file.md>` (or `$curtain:start <file.md>` in Codex, or `curtain <file.md>` in CLI).
- Segments file content into an array of sequential Acts (`Step[]`).
- State is initialized at `currentStep: 0` (`status: "running"`).
- Act 1 instructions are injected into the agent's context.

### Step 1: Turn Execution & Autonomous Progression
- The agent performs the instructions for Act $N$.
- When the agent finishes and attempts to conclude its turn, the platform `Stop` hook fires.
- **If the active Act's concluding delimiter is `auto` (`> [!CURTAIN]` or EOF):**
  - If more Acts remain, the `Stop` hook blocks termination and supplies Act $N+1$ immediately.
  - If Act $N$ was the final Act, the execution finishes.
- **If the active Act's concluding delimiter is `pause` (`> [!INTERMISSION]`):**
  - The runner updates `status: "paused"`.
  - The `Stop` hook allows the agent to conclude its turn, report its findings, and yield control to the developer.

### Step 2: The Review Loop at an Intermission
- While paused at an intermission, any regular feedback message sent by the developer replays the intermission instruction to the agent:
  ```
  [INTERMISSION REVIEW]
  <intermission instruction>

  Conclude your turn when complete. The curtain remains paused until the user enters /next. Inform the user that only /next will proceed.
  ```
- Downstream Acts remain completely withheld from context.
- Once satisfied, the developer advances to the next step:
  ```bash
  /next
  ```
- The `PreInvocation` hook advances `currentStep`, sets `status: "running"`, and injects Act $N+1$.

### Step 3: Completion
- When the final Act finishes, the `Stop` hook permits termination and removes the state file.

---

## 5. Command Reference

| Command (Claude / AGY) | Command (Codex CLI) | CLI Terminal | Description |
| :--- | :--- | :--- | :--- |
| `/curtain <file.md>` | `$curtain:start <file.md>` | `curtain <file.md>` | Start execution of a multi-act script. |
| `/next` | `$curtain:next` | `curtain next` | Advance to the next Act when paused at an intermission. |
| `/curtain drop` | `$curtain:drop` | `curtain drop` | Abort execution and delete state. |
| `/curtain status` | `$curtain:status` | `curtain status` | Display current step number, total steps, and runner status (including intermission criteria if paused). |
| `/curtain help` | `$curtain:help` | `curtain help` | Display usage instructions and supported runner commands. |
