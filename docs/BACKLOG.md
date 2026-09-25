# Backlog

## Backlog Format Guidelines

- **Indexing:** Number all items sequentially starting from 1 (`### [ ] 1. <Title>`).
- **Current State:** Analyzed and concisely described based on the current codebase.
- **Objective:** Concise description of the goal.
- **Agent Triage:** Max 1–3 lines. Ideas, considerations, or edge cases from the agent. Keep writing concise. No implementation outlines, no pre-planning.

---

### [ ] 1. Multi-Harness Namespaced Command Normalization (`/curtain:curtain`, `/curtain:*`)
- **Current State:** `parseCommand` matches slash, mention, and codex prefixes, but harness-specific namespaces (such as Claude plugin colon syntax `/curtain:status` or Codex `$curtain:*`) lack complete test coverage and uniform normalization.
- **Objective:** Normalize all harness-specific command formats across Claude Code, Antigravity, Codex CLI, and GitHub Copilot into canonical runner actions.
- **Agent Triage:** Keep normalization logic centralized in `src/lib/parseCommand.ts`. Add matrix snapshot tests covering every harness's slash and colon variants.

### [ ] 2. Multi-Harness Matrix CI/CD Pipeline
- **Current State:** `ci.yml` tests Node 22 on push/PR and `publish.yml` publishes on manual workflow dispatch, but multi-OS matrices and automated tag-based release triggers are absent.
- **Objective:** Expand CI to test across Node versions and operating systems, automate tag-based publishing, and run automated integration tests against simulated harness payloads.
- **Agent Triage:** Keep CI fast by testing harnesses via recorded mock payloads rather than spinning up full agent runtimes.

### [ ] 3. Inline / Direct Prompt Script Execution
- **Current State:** Scripts must exist as files on disk (`curtain <file.md>`). `parseCommand` treats input arguments strictly as file paths, failing with `Script file not found` if raw instructions containing `<!-- curtain -->` are passed. Because harness chat prompts are immutable, entering multi-act prompts directly also leaks all downstream acts into context on turn 1.
- **Objective:** Support running multi-act instructions provided directly via prompt text or standard input while addressing the trade-off between soft in-memory execution and hard token withholding via scratch-file spilling.
- **Agent Triage:** Detect inline delimiters in `parseCommand` to allow in-memory execution via `parseScript(text, "<inline>")`, or route through a skill wrapper that spills instructions to disk before runner invocation.

### [x] 4. Distill Actual Reference Docs for Harness Docs
- **Current State:** Harness specifications in `src/harnesses/*.md` (`agy.md`, `claude.md`, `codex.md`, `copilot.md`) contain synthesized integration notes and reverse-engineered behavior that risk drifting from upstream agent runtime contracts.
- **Objective:** Distill authoritative, up-to-date reference documentation for each harness from official ecosystem sources, reference plugins (`ponytail`, `ralph-loop`, `superpowers`), and runtime specs into structured harness reference docs.
- **Agent Triage:** Verify official hook schemas and payload specs against upstream docs. Replace assumed behavior with tested cross-harness contracts.

### [ ] 5. Automatic Plan Invocation via `> [!PLAN]` Callout
- **Current State:** The parser only recognizes `> [!CURTAIN]` (auto-advance) and `> [!INTERMISSION]` (pause for review) delimiters to segment script steps. Scripts lack a dedicated callout to trigger planning mode or require an implementation plan before execution.
- **Objective:** Support a `> [!PLAN]` callout delimiter that designates a planning phase and prompts the runner or agent harness to produce an implementation plan before advancing.
- **Agent Triage:** Decide whether `> [!PLAN]` forms a dedicated step type (`"plan"`) or acts as a pause variant injecting planning rules. Account for differing planning artifacts and approval conventions across harnesses.

### [ ] 6. Parameter Passing and Parsing for `/curtain <file> <params>`
- **Current State:** `parseCommand` only extracts the target file path via `parseFilePath`, dropping all trailing arguments. Script runs cannot accept runtime arguments from slash commands or skill invocations.
- **Objective:** Support passing parameters in `/curtain <file> <params>` (and harness skill invocations), parse positional and flag parameters reliably, and expose them to the runner context.
- **Agent Triage:** Decide how parameters interpolate into step instructions or script context (e.g. variable replacement vs environment payload). Ensure quote-handling handles paths with spaces alongside flags.

### [ ] 7. Skill Migration Subcommands (`adopt` / `eject` or `wrap` / `unwrap`)
- **Current State:** Adopting Curtain for existing agent skills requires manually moving instructions from `SKILL.md` into `PLAYBOOK.md`, authoring the thin launcher wrapper, and inserting curtain callout delimiters. No tooling exists to discover visible skills or automate wrapping and unwrapping.
- **Objective:** Provide CLI subcommands (`adopt` and `eject`, or `wrap` and `unwrap`, proposed instead of `migrate`/`unmigrate`) that scan all skills visible from the working directory, copy raw skills to `PLAYBOOK.md`, install the thin curtain launcher wrapper into `SKILL.md`, and output actionable instructions to add callout delimiters manually or via `/plan`.
- **Agent Triage:** Prefer `wrap` / `unwrap` or `adopt` / `eject` over `migrate` / `unmigrate` to reflect the thin-launcher wrapping pattern rather than schema migration. Ensure the revert command safely verifies existing wrappers before merging `PLAYBOOK.md` back to prevent accidental overwrites.

### [ ] 8. Instruction Injection on Intermission Transition (Make a Plan)
- **Current State:** When execution pauses at an intermission boundary, the runner prompts the agent to halt and await `/next`, but does not provide contextual directives (such as asking the agent to formulate an implementation plan for the upcoming step or present artifacts for review).
- **Objective:** Inject tailored instructions into the agent prompt when pausing at an intermission step, instructing the agent to prepare a plan or review materials before waiting for user confirmation.
- **Agent Triage:** Determine whether these instructions are statically standard or configurable via playbook callout metadata (`> [!INTERMISSION] make a plan`). Coordinate with review artifact rules across harnesses.

### [ ] 9. Case Study: Monolithic Prompt vs. Curtain Step Execution
- **Current State:** Curtain is designed to eliminate context leakage and premature task execution by withholding downstream instructions behind step boundaries, but has no empirical benchmark comparing single monolithic prompts to curtain-gated execution.
- **Objective:** Run a controlled case study measuring token usage, instruction adherence, premature downstream actions, and error rates between pasting a complete multi-step prompt upfront versus executing it step-by-step with Curtain.
- **Agent Triage:** Pick a representative multi-phase task (e.g. multi-file refactor + verification). Track concrete failure modes: skipped constraints, out-of-order execution, and token waste from early backtracking.
