# OpenAI Codex CLI Reference & Index

This document provides the reference index and integration architecture for **OpenAI Codex CLI** (`codex`).

---

## Reference Documentation

- [Codex Hooks Reference (`codex-hooks.md`)](./codex-hooks.md): Full reference for hook discovery, lifecycle points (`UserPromptSubmit`, `PreToolUse`, `Stop`), payload format, and execution semantics.
- [Codex Skills & Plugins Reference (`codex-skills.md`)](./codex-skills.md): Rules for packaging reusable skills, commands, and plugins in Codex.
- [Codex Plugins Catalog & Format (`codex-plugins.md`)](./codex-plugins.md): Specification for plugin manifests and distributions.

---

## Skill Locations

As implemented in [`src/harnesses/codex.ts`](../../src/harnesses/codex.ts#L158):
- Workspace generic: `<workspace>/.agents/skills/`, `<workspace>/skills/`
- Workspace project skills: `<workspace>/.codex/skills/`
- Workspace plugins: `<workspace>/.codex/plugins/`
- Global user skills: `~/.codex/skills/`
- Installed plugin cache: `~/.codex/plugins/cache/`
- Plugin marketplaces: `~/.codex/plugins/marketplaces/`

---

## Integration Summary

| Dimension | Specification |
| :--- | :--- |
| **Adapter Source** | [`src/harnesses/codex.ts`](../../src/harnesses/codex.ts) |
| **Plugin Manifest** | `.codex-plugin/plugin.json` (or root `plugin.json`) |
| **Hook Manifest** | Declared in manifest: `"hooks": "./hooks/claude-codex-hooks.json"` |
| **Payload Casing** | `snake_case` |
| **Lifecycle Events** | `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` |
| **Blocking Mechanism** | Exit Code `2` (+ `stderr`) or `permissionDecision: "deny"` via JSON stdout |
| **Context Injection** | Top-level `{"systemMessage": "...", "hookSpecificOutput": {"additionalContext": "..."}}` |
| **Autonomous Loop Continuation** | `Stop`: `{"decision": "block", "reason": "..."}` (*strictly top-level*) |
| **Root Environment Variable** | `CLAUDE_PLUGIN_ROOT` (compatibility shim) |
| **State Storage Variable** | `PLUGIN_DATA` |
