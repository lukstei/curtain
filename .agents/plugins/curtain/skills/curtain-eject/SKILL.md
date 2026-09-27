---
name: curtain-eject
description: Reverses an adopted Curtain playbook back into a standard single-file skill by merging PLAYBOOK.md into SKILL.md and removing delimiters.
argument-hint: "<skill-name-or-path>"
---

Do not perform any actions from this skill description. Step instructions are provided dynamically in your context by the runner hook (`[STEP X OF Y]`). Execute only the active step instructions present in your context.

CRITICAL: NEVER inspect or read PLAYBOOK.md directly with file inspection tools. Future instructions are withheld behind curtains to enforce strict step-by-step execution. Reading the raw playbook bypasses the curtain and ruins the execution order.
