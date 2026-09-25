# Anthropic Claude Code Reference & Index

This document provides the reference index and integration architecture for **Anthropic Claude Code**.

---

## Reference Documentation

- [Claude Code Hooks Reference (`claude-hooks.md`)](./claude-hooks.md): Full reference for hook events (`UserPromptSubmit`, `Stop`, `PreToolUse`, `PostToolUse`), configuration schema, exit codes, and JSON input/output formats.
- [Claude Code Plugins Reference (`claude-plugins.md`)](./claude-plugins.md): Specification for plugin manifests (`plugin.json`), component paths, marketplace distribution, and caching rules.
- [Claude Code Skills Reference (`claude-skills.md`)](./claude-skills.md): Authoring skills (`SKILL.md`), frontmatter conventions, subagent execution, dynamic context, and discovery paths.

---

## Skill Locations

As implemented in [`src/harnesses/claude.ts`](../../src/harnesses/claude.ts#L145) and documented in `claude-skills.md`:
- Workspace generic: `<workspace>/.agents/skills/`, `<workspace>/skills/`
- Project skills: `<workspace>/.claude/skills/<skill-name>/SKILL.md`
- Project plugins: `<workspace>/.claude/plugins/`
- Personal skills: `~/.claude/skills/<skill-name>/SKILL.md`
- Marketplace plugins: `~/.claude/plugins/marketplaces/`
- Plugin cache: `~/.claude/plugins/cache/`
- Active plugin root: `$CLAUDE_PLUGIN_ROOT/skills/`

---

## Integration Summary

| Dimension | Specification |
| :--- | :--- |
| **Adapter Source** | [`src/harnesses/claude.ts`](../../src/harnesses/claude.ts) |
| **Plugin Manifest** | `.claude-plugin/plugin.json` (or root `plugin.json`) |
| **Hook Manifest** | Declared in manifest: `"hooks": "./hooks/claude-codex-hooks.json"` |
| **Payload Casing** | `snake_case` |
| **Lifecycle Events** | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` |
| **Tool Matchers** | Pipe-delimited string (e.g. `"Bash|Edit|Write"`) |
| **Blocking Mechanism** | **Exit Code 2** (+ explanation written to `stderr`) |
| **Context Injection** | `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "..."}}` |
| **Autonomous Loop Continuation** | `Stop`: `{"hookSpecificOutput": {"hookEventName": "Stop", "additionalContext": "..."}}` with exit code `0` |
| **Root Environment Variable** | `CLAUDE_PLUGIN_ROOT` |
| **State Storage Variable** | `CLAUDE_PLUGIN_DATA` |
