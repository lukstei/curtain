# Architectural Evidence & Design Rationale

This document records the empirical evidence, failure modes, and technical rationale behind Curtain's skill-based playbook execution architecture.

---

## 1. The Core Invariant

Curtain exists to enforce **physical token withholding**:
> **At any point in time, downstream steps and future instructions must NOT exist in the LLM's context window.**

Any architecture that allows downstream instructions to enter context on turn 1—whether through skill prompts, file attachments, autocomplete, or tool inspections—completely defeats Curtain.

---

## 2. Empirical Failure Modes: Why Past Approaches Failed

### A. Inline Playbooks in `SKILL.md` (Context Leakage)
- **The Design:** Placing multi-act instructions (`> [!CURTAIN]`, `> [!INTERMISSION]`) directly inside `SKILL.md`.
- **Harness Mechanism:** Modern agent harnesses (Claude Code, Antigravity, Codex) treat `SKILL.md` as public prompt context. When a skill is invoked, the harness automatically injects the entire contents of `SKILL.md` into the prompt.
- **Transcript Evidence:** In Claude Code sessions (e.g. `d2e461f5`, `e8994b51`), Claude Code attached the full contents of `SKILL.md` directly into the turn 1 message payload (`type: "text"` under user content).
- **Failure:** If Act 1, Act 2, and Act 3 reside in `SKILL.md`, all acts are immediately visible to the LLM on turn 1. Curtain's hook injecting `[STEP 1 OF 3]` cannot hide what the harness already exposed.

### B. Direct File Paths & Autocomplete (Attachment Leakage)
- **The Design:** Allowing users to invoke arbitrary files via `/curtain path/to/script.md`.
- **Harness Mechanism:** In interactive chat environments (e.g. Claude Code CLI), typing `@` to locate a script file automatically triggers Claude Code's file attachment mechanism.
- **Transcript Evidence (`d0247fb5`):** The user entered:
  ```text
  /curtain:curtain @.claude/skills/curtain-test/PLAYBOOK.md
  ```
  Claude Code captured the `@` mention and attached `PLAYBOOK.md` as a full file attachment in the message turn:
  ```json
  { "type": "file", "filePath": ".claude/skills/curtain-test/PLAYBOOK.md", "content": "..." }
  ```
- **Failure:** The entire playbook was leaked into context before Curtain's hook even executed.

### C. UI Mention Links in Codex (Parser Fragility)
- **The Design:** Passing playbook file paths in chat inputs.
- **Harness Mechanism:** In Codex Desktop, selecting a file or skill from the mention dropdown formats the input as Markdown links:
  ```text
  [$curtain:curtain](/Users/.../skills/curtain/SKILL.md) [PLAYBOOK.md](/Users/.../PLAYBOOK.md)
  ```
- **Transcript Evidence (`01a0da5a-707b-7700-8196-124c5b90282c`):** The runner parser did not account for Markdown link wrappers. It treated `[PLAYBOOK.md](...)` as a raw string, failing with:
  ```text
  Curtain scripts must be Markdown files (.md or .markdown).
  ```
  The model then fell back to running raw shell commands and reading files uncurtained.

### D. Agent-Driven Invocation (The Tool Invocation Dead-End)
- **The Design:** `SKILL.md` contains an instruction telling the agent to run Curtain:
  ```markdown
  ## Instructions
  Run this workflow using Curtain:
  /curtain <skill-name>
  ```
- **Harness Mechanism:** LLMs cannot type slash commands into the chat terminal. When an agent is told to run a slash command:
  - In Claude Code, the agent attempts to call the `Skill` tool: `Skill("curtain:curtain", "curtain-test")`.
  - In Antigravity and Codex, slash commands are strictly user-facing; agents cannot execute them.
- **Transcript Evidence A (`e40fcf6c`):**
  When Curtain was not pre-started, Claude called `Skill("curtain:curtain", "curtain-test")`. Claude Code's internal plugin engine executed the tool by simply displaying Curtain's `SKILL.md` help text. It **never** triggered `UserPromptSubmit`. Claude then tried `which curtain` in bash (`curtain not found`). Curtain never started; Claude was trapped in an infinite retry loop.
- **Transcript Evidence B (`e8994b51`, `ef3a12bd`):**
  When Curtain pre-started execution on the user's `/curtain-test` prompt, Claude still saw the instruction in `SKILL.md` to run Curtain. Claude called `Skill("curtain:curtain", "curtain-test")`. Curtain's `PreToolUse` hook intercepted and blocked the call:
  ```text
  PreToolUse:Skill hook error: BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke Curtain or the active skill via the Skill tool.
  ```
  This injected an ugly error message and disrupted the session.

---

## 3. The Established Architecture

Based on the evidence above, Curtain enforces the following structural rules:

```
.claude/skills/<skill-name>/  (or .agents/skills/<skill-name>/)
├── SKILL.md       # Public skill manifest (loaded by harness into prompt)
└── PLAYBOOK.md    # Backstage multi-act script (withheld by Curtain)
```

### 1. `SKILL.md` is Strictly Passive
- Contains only high-level workflow descriptions and execution constraints.
- **Never** instructs the agent to run `/curtain` or call runner tools.
- Instructs the agent to execute only the active step injected into its prompt and forbids inspecting `PLAYBOOK.md`.

### 2. Backstage `PLAYBOOK.md`
- Multi-act instructions (`> [!CURTAIN]`, `> [!INTERMISSION]`) reside exclusively in `PLAYBOOK.md`.
- File-reading tools targeting `PLAYBOOK.md` are hard-blocked by Curtain's `PreToolUse` hook.

### 3. User Invocation is Strictly `/<skill-name>` in Chat
- The user triggers workflows via the skill's natural slash command (e.g. `/curtain-test`, `/deploy`).
- Curtain's pre-invocation hook intercepts the command, resolves the skill directory, finds `PLAYBOOK.md`, and injects Act 1.
- No redundant `/curtain <skill-name>` command is needed in chat.
- The `curtain` slash command skill (`skills/curtain/`) is removed from chat entirely, leaving `/next` as the sole runner command.

### 4. No Standalone CLI Invocation
- Curtain is an agent lifecycle hook plugin, not a standalone shell runner.
- State is strictly scoped to the agent conversation session (`session_id`). Running `curtain <skill>` or `curtain next` in an external terminal cannot inject instructions or manipulate context inside the host agent's chat window.
- The binary (`dist/curtain.cjs`) exclusively serves hook events dispatched by agent harnesses:
  ```bash
  curtain hook pre
  curtain hook tool
  curtain hook stop
  ```

