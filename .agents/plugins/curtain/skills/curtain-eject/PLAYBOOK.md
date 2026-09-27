# Eject Curtain Playbook into Vanilla Skill

Convert an adopted Curtain playbook back into a standard single-file skill.

## Step 1: Ingest & Propose Restored Skill

Locate the target skill, extract the original frontmatter, and strip out Curtain delimiters.

1. **Locate Target Skill:**
   - Check the invocation prompt for a skill name or path.
   - If not provided, inspect `.agents/skills/`, `skills/`, and global skill paths. If multiple candidates exist, ask the user to pick one.

2. **Verify Prerequisites:**
   - Check that `<skill-dir>/PLAYBOOK.md` exists.
   - Check that `<skill-dir>/SKILL.md` exists and contains the Curtain delegation notice.
   - If `PLAYBOOK.md` does not exist or `SKILL.md` is already a vanilla skill, inform the user that this skill is not an adopted playbook and halt without modifying files.

3. **Extract Frontmatter & Strip Delimiters:**
   - Extract the YAML frontmatter block (`---...---`) from `SKILL.md`.
   - Read the markdown content of `PLAYBOOK.md`.
   - Strip all top-level `> [!CURTAIN]` and `> [!INTERMISSION]` callout blockquotes (ignoring any blockquotes nested inside fenced code blocks).
   - Collapse excess consecutive blank lines (3+ newlines) resulting from removed delimiters into standard double newlines (`\n\n`).

4. **Assemble Proposed `SKILL.md`:**
   - Combine the preserved YAML frontmatter with the stripped body:
     ```markdown
     ---
     <preserved-frontmatter>
     ---

     <stripped-body>
     ```

5. **Present Proposal in Review Sidebar Artifact:**
   - Create a review artifact (`UserFacing: true`, `RequestFeedback: true`) containing:
     - Target skill name and directory path.
     - The full proposed restored `SKILL.md` content.
     - Notice that confirming will permanently delete `PLAYBOOK.md` and restore the skill to native execution.
   - Direct the user to the artifact to review before confirming.

> [!INTERMISSION]

## Step 2: Apply Restoration & Delete Playbook

Apply the restored file and remove the playbook.

1. **Overwrite `SKILL.md`:**
   - Write the unified frontmatter and body into `<skill-dir>/SKILL.md`.

2. **Delete `PLAYBOOK.md`:**
   - Remove `<skill-dir>/PLAYBOOK.md` from the filesystem.

3. **Verify Restoration:**
   - Confirm `<skill-dir>/SKILL.md` contains the full restored instructions.
   - Confirm `<skill-dir>/PLAYBOOK.md` no longer exists.

4. **Summarize Results:**
   - Inform the user that the skill has been ejected back to a standard single-file skill.
   - Confirm that the skill will now execute natively without Curtain interception.
