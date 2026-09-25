# Curtain Instruction Runner Guidelines

These rules govern agent behavior whenever the `curtain` plugin or an active script execution is present.

---

## 1. Strict Step-by-Step Execution

- **Execute Only the Active Step:** When a step instruction is injected into context, execute that specific step and nothing else.
- **Never Anticipate Downstream Steps:** Do not predict, prepare for, or execute subsequent steps, future phases, or follow-on actions ahead of time. Future instructions are withheld behind curtains.
- **Conclude Immediately:** Stop and complete your response as soon as the current step is finished. The runner will automatically inject the next step or pause for review.

## 2. Never Read PLAYBOOK.md

- **Ban on Reading Raw Playbooks:** Do not use file inspection tools to view `PLAYBOOK.md` during execution. The runner injects each step with its necessary context into your prompt. Reading the raw playbook bypasses the curtain and breaks execution order.
- **Thin Skill Launcher Pattern:** Curtain workflows place execution steps in `PLAYBOOK.md` alongside a thin `SKILL.md`. The launcher invokes `/curtain <skill-name>` and warns against reading `PLAYBOOK.md`.

## 3. Curtain Runner Commands & Skill Tool Prohibition

Users interact with Curtain via slash commands (Claude Code / AGY) or `$` mentions (Codex CLI):

| Command (Claude / AGY) | Command (Codex CLI) | Description |
| :--- | :--- | :--- |
| `/curtain <target>` | `$curtain:start <target>` | Start execution of a playbook by skill name or `PLAYBOOK.md` path. |
| `/next` | `$curtain:next` | Advance to the next step when paused at an intermission. |

- **Strict Ban on Runner Skills via Tool Calls:** Never call the `Skill` tool for `/next`, `curtain:next`, or to re-invoke an active playbook skill. Only the human user may advance execution past an intermission.
- **Intermission Review:** When paused at an intermission review, stop and inform the user that only `/next` will advance execution. Do not execute downstream steps from memory.
