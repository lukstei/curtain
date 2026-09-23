# Backlog

## Backlog Format Guidelines

- **Indexing:** Number all items sequentially starting from 1 (`### [ ] 1. <Title>`).
- **Current State:** Analyzed and concisely described based on the current codebase.
- **Objective:** Concise description of the goal.
- **Agent Triage:** Max 1–3 lines. Ideas, considerations, or edge cases from the agent. Keep writing concise. No implementation outlines, no pre-planning.

---

### [ ] 1. Multi-Harness Namespaced Command Normalization (`/wf:wf`, `/wf:wf-*`)
- **Current State:** `parseCommand` matches slash, mention, and codex prefixes, but harness-specific namespaces (such as Claude plugin colon syntax `/wf:run` or Codex `$wf:wf-*`) lack complete test coverage and uniform normalization.
- **Objective:** Normalize all harness-specific command formats across Claude Code, Antigravity, Codex CLI, and GitHub Copilot into canonical runner actions.
- **Agent Triage:** Keep normalization logic centralized in `src/lib/parseCommand.ts`. Add matrix snapshot tests covering every harness's slash and colon variants.

### [ ] 2. Multi-Harness Matrix CI/CD Pipeline
- **Current State:** `ci.yml` tests Node 22 on push/PR and `publish.yml` publishes on manual workflow dispatch, but multi-OS matrices and automated tag-based release triggers are absent.
- **Objective:** Expand CI to test across Node versions and operating systems, automate tag-based publishing, and run automated integration tests against simulated harness payloads.
- **Agent Triage:** Keep CI fast by testing harnesses via recorded mock payloads rather than spinning up full agent runtimes.
