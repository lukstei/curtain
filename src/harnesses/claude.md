# Anthropic Claude Code Integration Specification

This document details the architecture, lifecycle protocols, and runtime behavior for integrating `curtain` with **Anthropic Claude Code**.

---

## 1. Specification Matrix

| Dimension | Specification |
| :--- | :--- |
| **Plugin Manifest** | Project/Global: `.claude-plugin/plugin.json` (or root `plugin.json`) |
| **Hook Manifest** | Declared in manifest: `"hooks": "./hooks/claude-codex-hooks.json"` |
| **Marketplace Catalog** | Catalog file: `.claude-plugin/marketplace.json` |
| **Payload Casing** | `snake_case` |
| **Lifecycle Events** | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop` |
| **Tool Matchers** | Pipe-delimited string (e.g., `"Bash\|Edit\|Write"`) |
| **Blocking Mechanism** | **Exit Code 2** (+ explanation written to `stderr`) |
| **Tool Input Modification** | JSON stdout `updatedInput` (wholesale input object replacement) |
| **Context Injection** | `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "..."}}` |
| **Autonomous Loop Continuation** | `Stop`: `{"decision": "block", "reason": "..."}` with exit code `0` |
| **Root Environment Variable** | `CLAUDE_PLUGIN_ROOT` |
| **State Storage Variable** | `CLAUDE_PLUGIN_DATA` |

---

## 2. Discovery & Environment

Claude Code discovers plugins via `.claude-plugin/`:

- **Manifest Path**: `.claude-plugin/plugin.json`
- **Hooks Declaration**: Points to `hooks/claude-codex-hooks.json`

### Environment Variables

| Variable | Purpose |
| :--- | :--- |
| `CLAUDE_PLUGIN_ROOT` | Root directory of the installed plugin bundle. |
| `CLAUDE_PROJECT_DIR` | Working directory of the active user project. |
| `CLAUDE_PLUGIN_DATA` | Persistent directory for plugin session state. |

---

## 3. Harness Detection

- **Hook invocation:** `payload.hook_event_name` is defined (Source: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/hooks)
- **Tool invocation:** `process.env.CLAUDE_CODE_SESSION_ID` is defined (Source: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)

---

## 4. Lifecycle Hooks & Egress Protocol

### 4.1 Stop Hook
- Triggers when an assistant turn finishes.
- **Continuation**: To keep the runner moving without waiting for human input, write JSON on stdout and exit `0`:
  ```json
  {
    "decision": "block",
    "reason": "[ACT 2 OF 3]\n\nExecute next act..."
  }
  ```
- **Termination**: To allow Claude to stop (script complete, waiting at gate, or paused), output `{}` with exit code `0`.
- **Runaway Loop Protection**: The curtain runner terminates when execution is complete or paused. Claude Code's platform block cap (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) prevents runaway loops. Intermediate continuation turns have `stop_hook_active: true` and continue with `{"decision": "block"}` until complete.

### 4.2 UserPromptSubmit Hook
- Triggers when a user enters a prompt or runs a command like `/next`.
- Injects context via `hookSpecificOutput`:
  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "UserPromptSubmit",
      "additionalContext": "Act instructions..."
    }
  }
  ```

### 4.3 PreToolUse Hook
- Triggers before a tool executes.
- **Blocking**: Denying a tool requires **exit code 2** with the reason printed to `stderr`:
  ```bash
  exit 2
  # stderr: "Action blocked by runner policy."
  ```
- **Allowing**: Exit code `0` with empty output.
- **Modifying Input**: Exit code `0` with `updatedInput` replacing arguments completely.

---

## 5. Installation & Distribution

Install via Claude Code CLI:

```bash
claude plugin marketplace add lukstei/curtain
claude plugin install curtain@curtain-marketplace
```

Or from inside an interactive session:

```bash
/plugin marketplace add lukstei/curtain
/plugin install curtain@curtain-marketplace
```
