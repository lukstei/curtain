# GitHub Copilot / VS Code Agent Reference & Index

This document provides the reference index and integration architecture for **GitHub Copilot** in VS Code.

---

## Reference Documentation

- [VS Code Agent Hooks Reference (`copilot-hooks.md`)](./copilot-hooks.md): Official configuration format, lifecycle events (`UserPromptSubmit`, `Stop`, `PreToolUse`), payloads, exit codes, and output decisions.
- [VS Code Agent Skills (`copilot-skills.md`)](./copilot-skills.md): Official documentation for Agent Skills in VS Code, directory structures, and supported scopes.
- [VS Code AI Extensibility Overview (`copilot-extensibility.md`)](./copilot-extensibility.md): Architecture of AI extensibility in VS Code, including agent mode, language models, tools, and chat.
- [Language Model Tool API Reference (`copilot-tools.md`)](./copilot-tools.md): Tool calling mechanics, definitions, and lifecycle flow in VS Code Copilot agent mode.

---

## Skill Locations

As documented in `copilot-skills.md` and implemented in [`src/harnesses/copilot.ts`](../../src/harnesses/copilot.ts#L152):
- Workspace generic: `<workspace>/.agents/skills/`, `<workspace>/skills/`
- Workspace GitHub skills: `<workspace>/.github/skills/`
- Supported agent locations: `<workspace>/.claude/skills/`, `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`

---

## Integration Summary

| Dimension | Specification |
| :--- | :--- |
| **Adapter Source** | [`src/harnesses/copilot.ts`](../../src/harnesses/copilot.ts) |
| **Plugin Discovery** | Subdirectory under `.vscode/agent-plugins/` or extension root |
| **Hook Manifest** | Declared in manifest: `"hooks": "./hooks/copilot-hooks.json"` or shared Claude/Codex hooks |
| **Payload Casing** | `snake_case` (mirrors Claude Code payload conventions) |
| **Lifecycle Events** | `UserPromptSubmit` (pre), `Stop`, `PreToolUse` |
| **Blocking Mechanism** | JSON stdout: `{"permissionDecision": "deny", "permissionDecisionReason": "..."}` or exit code `2` with `stderr` |
| **Context Injection** | Top-level `{"additionalContext": "..."}` on `pre` |
| **Autonomous Loop Continuation** | `Stop`: `{"decision": "block", "reason": "..."}` |
| **Root Environment Variable** | `CLAUDE_PLUGIN_ROOT` (pointing inside `.vscode/.../agent-plugins/`) |
| **State Storage Variable** | `COPILOT_PLUGIN_DATA` |
