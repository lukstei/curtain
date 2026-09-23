# Curtain Playbook Syntax Specification (`curtain`)

This document specifies the Markdown grammar, structure, and execution rules for `@lukstei/curtain` instruction playbooks.

---

## 1. Overview & Principles

Unlike complex DAG workflow engines that require YAML frontmatter, schema validation, and AST parsing, **Curtain** uses pure Markdown string segmentation:

- **Zero Schema Overhead:** Any valid Markdown file can be executed as a playbook.
- **Act Isolation:** Scripts are split into sequential **Acts** separated by explicit curtain delimiters.
- **Physical Token Withholding:** The host runner injects only the active Act into the agent's context window. Future instructions do not exist in the prompt, rendering skip-ahead physically impossible.

---

## 2. Curtain Delimiters

Acts are bounded by heading-level curtain tags (`## <curtain...>`):

| Delimiter | Type | Behavior |
| :--- | :--- | :--- |
| `## <curtain>` | Automatic Transition | Intercepts turn conclusion via the `Stop` hook and automatically feeds the next Act without waiting for user confirmation. |
| `## <curtain:auto>` | Automatic Transition | Explicit synonym for `## <curtain>`. |
| `## <curtain:gate>` | Intermission Gate | Intermission for human-in-the-loop review. The `Stop` hook permits the agent to stop its turn and report back. The next Act is only injected when the developer explicitly raises the curtain via `/curtain raise`. |
| `## <curtain:pause>` | Intermission Gate | Backward-compatible synonym for `## <curtain:gate>`. |

### Grammar Rules

1. **Heading Format:** Delimiters must appear on their own line as an `H2` heading:
   ```markdown
   ## <curtain>
   ```
   or
   ```markdown
   ## <curtain:gate>
   ```
2. **Case Insensitivity & Whitespace:** Tags are case-insensitive (`## <CURTAIN:GATE>`, `## <curtain:gate>`) and allow flexible internal spacing (`##   <curtain:gate>   `).
3. **No Trailing Text:** Delimiter headings should not contain additional heading text. Any descriptive titles should be placed in subsequent headings inside the Act body (e.g. `## Act 2: Local Verification`).
4. **Single-Act Fallback:** A Markdown document with no curtain delimiters is treated as a single Act of type `auto` and executes normally.

---

## 3. Playbook Structure

```markdown
# Database Migration Playbook

Optional playbook preamble or context placed before the first Act.

## Act 1: Schema Audit & Draft Migration
Audit existing tables in `src/db/schema.ts`.
Write a non-destructive migration script in `migrations/002_user_prefs.sql`.
Do not apply the migration yet.

## <curtain:gate>

## Act 2: Local Verification
Run the migration script against local test Postgres container.
Run existing test suite to check for regressions.

## <curtain>

## Act 3: Cleanup & Documentation
Update the ORM models and export types.
Update schema docs in `docs/db.md`.
```

---

## 4. Execution Lifecycle

### Step 0: Ingestion
- Ingested via `/curtain <file.md>` (or `$curtain:start <file.md>` in Codex, or `curtain <file.md>` in CLI).
- Segments file content into an array of sequential Acts.
- State is initialized at `currentStep: 0` (`status: "running"`).
- Act 1 instructions are injected into the agent's context.

### Step 1: Turn Execution & Autonomous Progression
- The agent performs the instructions for Act $N$.
- When the agent finishes and attempts to conclude its turn, the platform `Stop` hook fires.
- **If the next transition is `auto` (`## <curtain>`):**
  - The `Stop` hook blocks termination and supplies Act $N+1$ immediately.
- **If the next transition is `gate` (`## <curtain:gate>`):**
  - The runner updates `status: "paused"`.
  - The `Stop` hook allows the agent to conclude its turn, report its findings, and yield control to the developer.

### Step 2: The Review Loop at a Gate
- While paused at a gate, the developer can provide interactive chat feedback to refine the current Act:
  > *"Add a foreign key constraint to team_id before proceeding."*
- Downstream Acts remain completely withheld from context.
- Once satisfied, the developer raises the curtain:
  ```bash
  /curtain raise
  ```
- The `PreInvocation` hook intercepts the command, advances `currentStep`, sets `status: "running"`, and injects Act $N+1$.

### Step 3: Completion
- When the final Act finishes, the `Stop` hook permits termination and removes the state file.

---

## 5. Command Reference

| Command (Claude / AGY) | Command (Codex CLI) | CLI Terminal | Description |
| :--- | :--- | :--- | :--- |
| `/curtain <file.md>` | `$curtain:start <file.md>` | `curtain <file.md>` | Start execution of a multi-act script. |
| `/curtain raise` | `$curtain:raise` | `curtain raise` | Advance to the next Act when paused at a gate. |
| `/curtain drop` | `$curtain:drop` | `curtain drop` | Abort execution and delete state. |
| `/curtain status` | `$curtain:status` | `curtain status` | Display current step number, total steps, and runner status. |
| `/curtain help` | `$curtain:help` | `curtain help` | Display usage instructions and supported runner commands. |
