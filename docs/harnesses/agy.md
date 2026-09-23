# Google Antigravity (AGY) Reference & Index

This document provides the reference index and integration architecture for **Google Antigravity (AGY)** and **Gemini CLI**.

---

## Reference Documentation

- [AGY Lifecycle Hooks (`agy-hooks.md`)](./agy-hooks.md): Full specification of hook lifecycle events (`PreInvocation`, `Stop`, `PreToolUse`, `PostToolUse`), payload schemas, matchers, and return decisions.
- [AGY Plugins Architecture (`agy-plugins.md`)](./agy-plugins.md): Manifest structure, catalog specifications, and namespaced plugin layout.
- [AGY Workspace Skills (`agy-skills.md`)](./agy-skills.md): Directory structure (`skills/<skill_name>/SKILL.md`), frontmatter schema (`name`, `description`), and progressive disclosure.

---

## Skill Locations

As implemented in [`src/harnesses/agy.ts`](../../src/harnesses/agy.ts#L210), AGY resolves skills in:
- Workspace generic: `<workspace>/.agents/skills/`, `<workspace>/skills/`
- Workspace plugins: `<workspace>/.agents/plugins/`
- Global user skills: `~/.gemini/config/skills/`
- Global plugins: `~/.gemini/config/plugins/`
- Built-in skills: `~/.gemini/antigravity/builtin/skills/`

---

## Integration Summary

| Dimension | Specification |
| :--- | :--- |
| **Adapter Source** | [`src/harnesses/agy.ts`](../../src/harnesses/agy.ts) |
| **Plugin Manifest** | `.agents/plugins/curtain/plugin.json` |
| **Hook Manifest** | `.agents/plugins/curtain/hooks.json` |
| **Payload Casing** | **camelCase** (protojson serialization) |
| **Lifecycle Events** | `PreInvocation`, `Stop`, `PreToolUse`, `PostToolUse` |
| **Tool Matchers** | Regular expressions in `matcher`: `"run_command|view_file"` |
| **Blocking Mechanism** | JSON stdout: `{"decision": "deny", "reason": "..."}` with exit code `0` |
| **Context Injection** | `PreInvocation`: `{"injectSteps": [{"ephemeralMessage": "..."}]}` |
| **Autonomous Loop Continuation** | `Stop`: `{"decision": "continue", "reason": "..."}` |
| **Harness Detection** | `process.env.GEMINI_CLI === "1"` or `process.env.ANTIGRAVITY === "1"` or `raw.conversation_id` present with `artifactDirectoryPath` / `cwd` |
