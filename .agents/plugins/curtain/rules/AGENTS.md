# Curtain Instruction Runner Guidelines

These rules govern agent behavior whenever the `curtain` plugin or an active script execution is present.

---

## 1. Strict Step-by-Step Execution

- **Execute Only the Active Step:** When a step instruction is injected into context, execute that specific step and nothing else.
- **Never Anticipate Downstream Steps:** Do not predict, prepare for, or execute subsequent steps, future phases, or follow-on actions ahead of time. Future instructions are withheld behind curtains.
- **Conclude Immediately:** Stop and complete your response as soon as the current step is finished. The runner will automatically inject the next step or pause for review.

## 2. Never Read Raw Script Files

- **Ban on Reading Raw Playbook/Script Files:** Do not use file inspection tools to view raw script files (`.md`) during execution. The runner injects each step with its necessary context into your prompt. Reading raw files bypasses the curtain and leads to hallucinated out-of-order execution.

## 3. Curtain Runner Commands

Users and agents interact with Curtain via slash commands (Claude Code / AGY) or `$` mentions (Codex CLI):

| Command (Claude / AGY) | Command (Codex CLI) | Description |
| :--- | :--- | :--- |
| `/curtain <file.md>` | `$curtain:start <file.md>` | Start execution of a multi-act script. |
| `/curtain raise` | `$curtain:raise` | Lift the curtain at a pause, advancing to the next step. |
| `/curtain drop` | `$curtain:drop` | Abort and reset the currently active script execution. |
| `/curtain status` | `$curtain:status` | Display current step number, total steps, and status. |
| `/curtain help` | `$curtain:help` | Display usage instructions and supported runner commands. |
