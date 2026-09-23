# Google Antigravity (AGY) Integration Specification

This document details the architecture, lifecycle protocols, and runtime behavior for integrating `curtain` with **Google Antigravity (AGY)** and **Gemini CLI**.

---

## 1. Specification Matrix

| Dimension | Specification |
| :--- | :--- |
| **Plugin Manifest** | Project: `.agents/plugins/curtain/plugin.json`<br>Global: `~/.gemini/config/plugins/curtain/plugin.json` |
| **Hook Manifest** | Declared in plugin folder: `.agents/plugins/curtain/hooks.json` |
| **Marketplace Catalog** | Catalog file: `.agents/plugins/marketplace.json` |
| **Payload Casing** | **camelCase** (protojson serialization) |
| **Lifecycle Events** | `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop` |
| **Tool Matchers** | Regular expressions in `matcher`: `"run_command\|view_file"` |
| **Blocking Mechanism** | JSON stdout: `{"decision": "deny", "reason": "..."}` with exit code `0` |
| **Tool Input Modification** | JSON stdout `overwrite` (shallow top-level merge into arguments) |
| **Context Injection** | `PreInvocation`: `{"injectSteps": [{"ephemeralMessage": "..."}]}` |
| **Autonomous Loop Continuation** | `Stop`: `{"decision": "continue", "reason": "..."}` |
| **Root Environment Variable** | None set (working directory defaults to directory containing `hooks.json`) |
| **State Storage Variable** | Stdin payload field: `artifactDirectoryPath` (or project local state) |

---

## 2. Discovery & Environment

Antigravity discovers plugins from `.agents/plugins/` (project-scoped) or `~/.gemini/config/plugins/` (user-scoped):

- **Manifest Path**: `.agents/plugins/curtain/plugin.json`
- **Hooks Declaration**: `.agents/plugins/curtain/hooks.json`
- **Execution Model**: Hook commands run as child processes declared in `hooks.json`.

### Environment Variables & Payload Markers

Antigravity passes hook context on standard input rather than injecting shell environment variables.

| Marker | Source | Purpose |
| :--- | :--- | :--- |
| `AGY_HOOK_ACTIVE` | Environment | Set to `"1"` by hook wrappers/guards. |
| `workspacePaths` | Stdin Payload | Array of active workspace directory paths. |
| `executionNum` | Stdin Payload | Sequence number of the hook invocation. |
| `invocationNum` | Stdin Payload | Model turn invocation index. |
| `artifactDirectoryPath` | Stdin Payload | Path to conversation artifact storage. |

---

## 3. Harness Detection

- **Hook invocation:** `payload.transcriptPath` ends with `.system_generated/logs/transcript.jsonl` (Source: https://antigravity.google/docs/hooks/#hook-handler-configuration)
- **Tool invocation:** `process.env.ANTIGRAVITY_CONVERSATION_ID` is defined (Source: https://antigravity.google/docs/)

---

## 4. Lifecycle Hooks & Egress Protocol

### 4.1 Stop Hook
- Triggers when an agent step concludes.
- **Continuation**: To advance the workflow to the next step:
  ```json
  {
    "decision": "continue",
    "reason": "[WORKFLOW: Step 2/3]\n\nExecute next step..."
  }
  ```
- **Allowing Stop**: When workflow is paused, waiting on user, or finished:
  ```json
  {
    "decision": "allow"
  }
  ```

### 4.2 PreInvocation Hook
- Triggers before the agent starts processing a turn.
- Injects ephemeral step instructions:
  ```json
  {
    "injectSteps": [
      {
        "ephemeralMessage": "Instruction for step..."
      }
    ]
  }
  ```

### 4.3 PreToolUse Hook
- Triggers before any tool runs.
- **Blocking**:
  ```json
  {
    "decision": "deny",
    "reason": "Policy explanation"
  }
  ```
- **Allowing with argument modification**:
  ```json
  {
    "decision": "allow",
    "overwrite": {
      "command": "sanitized_command"
    }
  }
  ```

---

## 5. Installation & Distribution

1. **Workspace Inclusion**: Place the plugin files in `.agents/plugins/curtain/`. Any workspace clone automatically inherits the plugin.
2. **Catalog Entry**: Declare the plugin in `.agents/plugins/marketplace.json`:
   ```json
   {
     "name": "curtain",
     "source": {
       "source": "url",
       "url": "https://github.com/lukstei/curtain.git",
       "ref": "main"
     }
   }
   ```
3. **Global Machine Install**:
   ```bash
   agy plugin install https://github.com/lukstei/curtain
   ```
