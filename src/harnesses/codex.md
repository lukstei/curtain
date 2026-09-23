# OpenAI Codex CLI Integration Specification

This document details the architecture, lifecycle protocols, data schemas, and runtime behavior for integrating `curtain` with **OpenAI Codex CLI** (`codex`).

---

## 1. Specification Matrix

| Dimension | Specification |
| :--- | :--- |
| **Plugin Manifest** | Project/Global: `.codex-plugin/plugin.json` (or root `plugin.json`) |
| **Hook Manifest** | Declared in manifest: `"hooks": "./hooks/claude-codex-hooks.json"` |
| **Marketplace Catalog** | Remote catalog: `codex plugin marketplace add <org/repo>` |
| **Payload Casing** | `snake_case` (with alias fallbacks like `hookEventName`) |
| **Lifecycle Events** | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` |
| **Tool Matchers** | Pattern / String (e.g., `"Bash\|apply_patch"`) |
| **Blocking Mechanism** | Exit Code `2` (+ `stderr`) or `permissionDecision: "deny"` via JSON stdout |
| **Tool Input Modification** | Restricted; deny + prompt guidance preferred |
| **Context Injection** | `{"systemMessage": "...", "hookSpecificOutput": {"additionalContext": "..."}}` |
| **Autonomous Loop Continuation** | `Stop`: `{"decision": "block", "reason": "..."}` (*strictly top-level, no `hookSpecificOutput`*) |
| **Root Environment Variable** | `CLAUDE_PLUGIN_ROOT` (compatibility shim) |
| **State Storage Variable** | `PLUGIN_DATA` |
| **Security & Trust** | SHA-256 binary hash validation; requires `codex plugin trust curtain` |

---

## 2. Discovery & Environment

OpenAI Codex CLI discovers plugins via `.codex-plugin/` in a project or global directory:

- **Manifest Path**: `.codex-plugin/plugin.json`
- **Hooks Declaration**: Points to `hooks/claude-codex-hooks.json`
- **Execution Model**: Hook commands run as standalone child processes (`node dist/curtain.cjs hook <mode>`) passing JSON on `stdin` and expecting JSON on `stdout`.

### Environment Variables

| Variable | Purpose |
| :--- | :--- |
| `PLUGIN_DATA` | Persistent state storage directory assigned to the plugin session. |
| `CODEX_SESSION_ID` | Unique identifier of the active Codex CLI session. |
| `CODEX_THREAD_ID` | Thread identifier for the current conversation. |
| `CLAUDE_PLUGIN_ROOT` | Fallback root path for cross-harness plugin compatibility. |

---

## 3. Harness Detection

- **Hook invocation:** `payload.hookEventName` is defined (Source: https://github.com/openai/codex)
- **Tool invocation:** `process.env.CODEX_SESSION_ID` is defined (Source: https://github.com/openai/codex)

---

## 4. Ingestion & Input Schemas

Codex passes JSON payloads on standard input.

### Stop Hook Input (`stop.command.input`)

```rust
pub(crate) struct StopCommandInput {
    pub session_id: String,
    pub turn_id: String,
    pub transcript_path: NullableString,
    pub cwd: String,
    pub hook_event_name: String, // "Stop"
    pub model: String,
    pub permission_mode: String,
    pub stop_hook_active: bool,
    pub last_assistant_message: NullableString,
}
```

Key fields used by `curtain`:
- **`last_assistant_message`**: Contains the model text from the completed turn.
- **`stop_hook_active`**: Set to `true` if a Stop hook already re-triggered the model in this turn. When `true`, the hook must allow the turn to finish (`{}`) to prevent infinite loops.

---

## 5. Egress & Output Schemas

Codex parses hook stdout with Rust `serde` using `#[serde(deny_unknown_fields)]` (`additionalProperties: false`). Any unrecognized key causes the hook to fail with `hook returned invalid <event> hook JSON output`.

### 5.1 Stop Hook Output (`stop.command.output`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) struct StopCommandOutputWire {
    #[serde(flatten)]
    pub universal: HookUniversalOutputWire, // continue, stopReason, suppressOutput, systemMessage
    #[serde(default)]
    pub decision: Option<BlockDecisionWire>, // enum: ["block"]
    #[serde(default)]
    pub reason: Option<String>,
}
```

> [!IMPORTANT]
> `StopCommandOutputWire` does **not** allow `hookSpecificOutput`.
> To continue execution and inject the next step, emit top-level `decision: "block"` and `reason`:
> ```json
> {
>   "decision": "block",
>   "reason": "[ACT 2 OF 3]\n\nExecute next act..."
> }
> ```
> To allow the turn to finish:
> ```json
> {}
> ```

### 5.2 Prompt Submit Output (`user-prompt-submit.command.output`)

On `UserPromptSubmit` or `PreInvocation`, Codex accepts `hookSpecificOutput`:

```json
{
  "systemMessage": "[CURTAIN]",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Step instructions..."
  }
}
```

### 5.3 Tool Execution Output (`pre-tool-use.command.output`)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Policy explanation"
  }
}
```

---

## 6. Installation & Trust

```bash
codex plugin marketplace add lukstei/curtain
codex plugin install curtain
codex plugin trust curtain
```

Codex records a SHA-256 hash of `dist/curtain.cjs`. Edits to the bundle require re-trusting before execution.
