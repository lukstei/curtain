# Adopt Skill into Curtain Playbook

Convert an existing single-file agent skill into a Curtain multi-act playbook.

## Step 1: Ingest Skill & Propose Delimiters

Locate and analyze the target skill to identify natural boundaries for Curtain delimiters.

1. **Locate Target Skill:**
   - Check the invocation prompt for a skill name or path.
   - If not provided, inspect `.agents/skills/`, `skills/`, and global skill paths. If multiple candidates exist, ask the user to pick one.
   - Read the target `SKILL.md`.

2. **Assess Suitability:**
   - If the skill contains only passive reference material (e.g. style guides, dictionaries), inform the user that playbooks are designed for active procedures and recommend keeping it as a standard skill.

3. **Preserve Original Text with Minimal Surgical Pruning:**
   - Do NOT rewrite instructions or alter existing prose arbitrarily.
   - Do NOT invent special headlines (e.g. "## Act 1: ...", "## Phase 1: ...").
   - Keep all existing headings and content structure intact.
   - **Prune explicit wait instructions:** Remove redundant phrases instructing the agent to wait or pause for confirmation (e.g., "Wait for user confirmation before proceeding", "Stop and ask for approval"). The `> [!INTERMISSION]` delimiter handles pausing and awaiting `/next` natively.
   - **Prune context-leaking references:** Remove forward-looking promises or references that assume future steps are visible (e.g., "In Step 3 we will apply...", "Do not execute Step 2 yet"). Downstream steps are physically withheld behind curtains, so future-step warnings are obsolete.
   - **Strip Table of Contents:** Remove any Table of Contents or outline list of sections. Outlining future steps in the preamble leaks withheld steps into Act 1 and wastes tokens on human navigation links that an agent cannot use.

4. **Assign Bare Callout Delimiters:**
   - Insert delimiters between existing steps or major sections:
     - Use `> [!INTERMISSION]` ONLY at boundaries where the original skill had an explicit instruction to wait, pause for user confirmation, or formulate a plan.
     - Use `> [!CURTAIN]` for all other step or section transitions.
   - Do NOT add any text or criteria inside callout blockquotes. Keep them strictly bare:
     ```markdown
     > [!CURTAIN]
     ```
     or
     ```markdown
     > [!INTERMISSION]
     ```

5. **Present Proposal in Review Sidebar Artifact:**
   - Create a review artifact (`UserFacing: true`, `RequestFeedback: true`) containing:
     - **Quick Reference Card:**
       | Delimiter | Behavior |
       | :--- | :--- |
       | `> [!CURTAIN]` | Automatically advances to the next step when the turn concludes. |
       | `> [!INTERMISSION]` | Pauses execution and waits for the user to review and enter `/next`. |
     - **Proposed `PLAYBOOK.md`:** The exact markdown body with bare callout delimiters inserted between sections.
   - Do NOT display YAML frontmatter or the `SKILL.md` wrapper stub in the artifact.
   - Direct the user to the artifact to review or adjust delimiter choices.

> [!INTERMISSION]

## Step 2: Write Playbook and Update Skill

Apply the proposed changes to the skill directory.

1. **Create `PLAYBOOK.md`:**
   - Write the approved markdown containing the original body with bare delimiters into `<skill-dir>/PLAYBOOK.md`.
   - Do NOT add YAML frontmatter to `PLAYBOOK.md`.

2. **Update `SKILL.md`:**
   - Retain the original YAML frontmatter in `<skill-dir>/SKILL.md` completely unchanged.
   - Replace the entire body below the frontmatter with the Curtain delegation stub:
     ```markdown
     Do not perform any actions from this skill description. Step instructions are provided dynamically in your context by the runner hook (`[STEP X OF Y]`). Execute only the active step instructions present in your context.

     CRITICAL: NEVER inspect or read PLAYBOOK.md directly with file inspection tools. Future instructions are withheld behind curtains to enforce strict step-by-step execution. Reading the raw playbook bypasses the curtain and ruins the execution order.
     ```

> [!CURTAIN]

## Step 3: Verification & Next Steps

1. **Validate Playbook Grammar:**
   - Confirm `<skill-dir>/PLAYBOOK.md` contains at least two steps separated by `> [!CURTAIN]` or `> [!INTERMISSION]`.
   - Verify delimiters do not appear at the start of the file or consecutively.

2. **Summarize Results:**
   - Inform the user that the skill is ready for execution via `/<skill-name>`.
   - Explain how to advance during intermissions (`/next`).
   - Mention how to revert if ever needed: restore the original body back into `SKILL.md` and delete `PLAYBOOK.md`.
