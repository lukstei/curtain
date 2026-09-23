#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  getCliHelp: () => getCliHelp,
  parseCliArgs: () => parseCliArgs,
  runCli: () => runCli
});
module.exports = __toCommonJS(cli_exports);
var import_node_util = require("node:util");

// src/harnesses/index.ts
var import_strict = __toESM(require("node:assert/strict"), 1);

// src/lib/getLatestMessage.ts
var fs = __toESM(require("node:fs"), 1);
function defaultTranscriptParser(item) {
  const isUser = item.type === "USER_INPUT" || item.source === "USER_EXPLICIT";
  const isModel = (item.type === "PLANNER_RESPONSE" || item.source === "MODEL") && item.type !== "GENERIC";
  if ((isUser || isModel) && typeof item.content === "string") {
    return {
      type: isUser ? "USER_INPUT" : "PLANNER_RESPONSE",
      content: item.content
    };
  }
  return null;
}
function getLatestMessage(transcriptPath, parseItem = defaultTranscriptParser) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return null;
  }
  try {
    const stat = fs.statSync(transcriptPath);
    const readSize = Math.min(stat.size, 256 * 1024);
    const buffer = Buffer.alloc(readSize);
    const fd = fs.openSync(transcriptPath, "r");
    fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);
    const chunk = buffer.toString("utf-8");
    const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const item = JSON.parse(lines[i]);
        if (item && typeof item === "object") {
          const parsed = parseItem(item);
          if (parsed) {
            return parsed;
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return null;
}

// src/harnesses/agy.ts
var agyHarness = {
  id: "agy",
  detect(payload, env) {
    if (env.AGY_HOOK_ACTIVE || env.ANTIGRAVITY_CONVERSATION_ID) {
      return true;
    }
    return typeof payload.transcriptPath === "string" && payload.transcriptPath.endsWith(".system_generated/logs/transcript.jsonl");
  },
  normalize(payload, modeArg, env = process.env) {
    const conversationId = String(
      payload.conversationId ?? env.ANTIGRAVITY_CONVERSATION_ID ?? "default"
    );
    const workspacePaths = Array.isArray(payload.workspacePaths) ? payload.workspacePaths : void 0;
    const workspacePath = String(
      workspacePaths?.[0] ?? payload.cwd ?? env.PWD ?? "."
    );
    const terminationReason = typeof payload.terminationReason === "string" ? payload.terminationReason : void 0;
    const isStop = modeArg === "stop" || Boolean(terminationReason && payload.invocationNum === void 0);
    const type = isStop ? "stop" : "pre";
    const prompt = typeof payload.prompt === "string" ? payload.prompt : void 0;
    const isInterrupted = Boolean(
      terminationReason && /cancel|abort|interrupt/i.test(terminationReason)
    );
    const stopHookActive = Boolean(
      typeof payload.executionNum === "number" && payload.executionNum > 1
    );
    const partialEvent = {
      type,
      harness: "agy",
      conversationId,
      workspacePath,
      prompt,
      isStop,
      stopHookActive,
      terminationReason,
      isInterrupted,
      latestMessage: null,
      rawPayload: payload
    };
    partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
    return partialEvent;
  },
  extractLatestMessage(event) {
    const invocationNum = typeof event.rawPayload.invocationNum === "number" ? event.rawPayload.invocationNum : void 0;
    if (event.type === "pre" && invocationNum !== void 0 && invocationNum > 1) {
      return null;
    }
    const rawTranscript = event.rawPayload.transcriptPath ?? event.rawPayload.transcript_path;
    if (typeof rawTranscript === "string") {
      const msg = getLatestMessage(rawTranscript, defaultTranscriptParser);
      if (msg) return msg;
    }
    if (event.type === "stop") {
      const rawAssistant = event.rawPayload.last_assistant_message ?? event.rawPayload.lastAssistantMessage;
      if (typeof rawAssistant === "string" && rawAssistant.length > 0) {
        return {
          type: "PLANNER_RESPONSE",
          content: rawAssistant
        };
      }
    }
    if (event.prompt) {
      return {
        type: "USER_INPUT",
        content: event.prompt
      };
    }
    return null;
  },
  formatEgress(event, response) {
    if (event.type === "stop") {
      if (response.decision === "continue" && response.reason) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "continue",
            reason: response.reason
          })
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ decision: "allow" })
      };
    }
    if (event.type === "pre") {
      const ephemeralMessage = response.injectSteps?.[0]?.ephemeralMessage || "";
      if (!ephemeralMessage) {
        return { exitCode: 0, stdout: "{}" };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          injectSteps: [{ ephemeralMessage }]
        })
      };
    }
    return { exitCode: 0, stdout: JSON.stringify(response) };
  },
  resolveConversationId(env) {
    return env.ANTIGRAVITY_CONVERSATION_ID || null;
  },
  resolveStorageDir(env) {
    return env.AGY_PLUGIN_DATA || null;
  }
};

// src/harnesses/common.ts
function parseClaudeMessage(item) {
  if (item.role === "assistant" || item.message?.role === "assistant") {
    const msg = item.message ?? item;
    if (Array.isArray(msg.content)) {
      const textBlock = msg.content.find((c) => c.type === "text");
      if (typeof textBlock?.text === "string") {
        return {
          type: "PLANNER_RESPONSE",
          content: textBlock.text
        };
      }
    }
  }
  if (item.role === "user" && typeof item.content === "string") {
    return {
      type: "USER_INPUT",
      content: item.content
    };
  }
  return null;
}
function defaultExtractLatestMessage(event) {
  if (event.type === "stop") {
    const raw = event.rawPayload.last_assistant_message ?? event.rawPayload.lastAssistantMessage;
    if (typeof raw === "string" && raw.length > 0) {
      return {
        type: "PLANNER_RESPONSE",
        content: raw
      };
    }
    const transcript = event.rawPayload.transcript_path ?? event.rawPayload.transcriptPath;
    if (typeof transcript === "string") {
      return getLatestMessage(transcript, parseClaudeMessage);
    }
    return null;
  }
  if (event.prompt) {
    return {
      type: "USER_INPUT",
      content: event.prompt
    };
  }
  return null;
}

// src/harnesses/claude.ts
var claudeHarness = {
  id: "claude",
  detect(payload, env) {
    return payload.hook_event_name !== void 0 || Boolean(env.CLAUDE_CODE_SESSION_ID);
  },
  normalize(payload, modeArg, env = process.env) {
    const conversationId = String(payload.session_id ?? "default");
    const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
    const eventName = payload.hook_event_name;
    const isStop = modeArg === "stop" || eventName === "Stop" || payload.stop_hook_active !== void 0;
    const type = isStop ? "stop" : "pre";
    const prompt = typeof payload.prompt === "string" ? payload.prompt : void 0;
    const stopHookActive = Boolean(payload.stop_hook_active);
    const partialEvent = {
      type,
      harness: "claude",
      conversationId,
      workspacePath,
      prompt,
      isStop,
      stopHookActive,
      isInterrupted: false,
      latestMessage: null,
      rawPayload: payload
    };
    partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
    return partialEvent;
  },
  extractLatestMessage: defaultExtractLatestMessage,
  formatEgress(event, response) {
    if (event.type === "stop") {
      if (response.decision === "continue" && response.reason) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "block",
            reason: response.reason
          })
        };
      }
      return { exitCode: 0, stdout: "{}" };
    }
    if (event.type === "pre") {
      const text = response.injectSteps?.[0]?.ephemeralMessage || "";
      if (!text) {
        return { exitCode: 0, stdout: "{}" };
      }
      const hookEventName = typeof event.rawPayload.hook_event_name === "string" ? event.rawPayload.hook_event_name : "UserPromptSubmit";
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName,
            additionalContext: text
          }
        })
      };
    }
    return { exitCode: 0, stdout: JSON.stringify(response) };
  },
  resolveConversationId(env) {
    return env.CLAUDE_CODE_SESSION_ID || null;
  },
  resolveStorageDir(env) {
    return env.CLAUDE_PLUGIN_DATA || null;
  }
};

// src/harnesses/codex.ts
var codexHarness = {
  id: "codex",
  detect(payload, env) {
    return payload.hookEventName !== void 0 || Boolean(env.CODEX_SESSION_ID);
  },
  normalize(payload, modeArg, env = process.env) {
    const conversationId = String(
      payload.session_id ?? payload.sessionId ?? "default"
    );
    const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
    const eventName = payload.hook_event_name ?? payload.hookEventName;
    const isStop = modeArg === "stop" || eventName === "Stop" || payload.stop_hook_active !== void 0 || payload.stopHookActive !== void 0;
    const type = isStop ? "stop" : "pre";
    const prompt = typeof payload.prompt === "string" ? payload.prompt : void 0;
    const stopHookActive = Boolean(
      payload.stop_hook_active ?? payload.stopHookActive
    );
    const partialEvent = {
      type,
      harness: "codex",
      conversationId,
      workspacePath,
      prompt,
      isStop,
      stopHookActive,
      isInterrupted: false,
      latestMessage: null,
      rawPayload: payload
    };
    partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
    return partialEvent;
  },
  extractLatestMessage: defaultExtractLatestMessage,
  formatEgress(event, response) {
    if (event.type === "stop") {
      if (response.decision === "continue" && response.reason) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "block",
            reason: response.reason,
            suppressOutput: true
          })
        };
      }
      return { exitCode: 0, stdout: "{}" };
    }
    if (event.type === "pre") {
      const text = response.injectSteps?.[0]?.ephemeralMessage || "";
      if (!text) {
        return { exitCode: 0, stdout: "{}" };
      }
      const hookEventName = typeof event.rawPayload.hook_event_name === "string" ? event.rawPayload.hook_event_name : typeof event.rawPayload.hookEventName === "string" ? event.rawPayload.hookEventName : "UserPromptSubmit";
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          systemMessage: "[CURTAIN]",
          hookSpecificOutput: {
            hookEventName,
            additionalContext: text
          },
          suppressOutput: true
        })
      };
    }
    return { exitCode: 0, stdout: JSON.stringify(response) };
  },
  resolveConversationId(env) {
    return env.CODEX_SESSION_ID || null;
  },
  resolveStorageDir(env) {
    return env.PLUGIN_DATA || null;
  }
};

// src/harnesses/copilot.ts
var copilotHarness = {
  id: "copilot",
  detect(_payload, env) {
    return Boolean(env.COPILOT_PLUGIN_DATA || env.COPILOT_SESSION_ID);
  },
  normalize(payload, modeArg, env = process.env) {
    const conversationId = String(
      payload.sessionId ?? payload.session_id ?? payload.conversationId ?? "default"
    );
    const workspacePath = String(payload.cwd ?? env.PWD ?? ".");
    const eventName = payload.hook_event_name ?? payload.hookEventName;
    const isStop = modeArg === "stop" || eventName === "Stop" || payload.stop_hook_active !== void 0 || payload.stopHookActive !== void 0;
    const type = isStop ? "stop" : "pre";
    const prompt = typeof payload.prompt === "string" ? payload.prompt : typeof payload.initial_prompt === "string" ? payload.initial_prompt : typeof payload.initialPrompt === "string" ? payload.initialPrompt : void 0;
    const stopHookActive = Boolean(
      payload.stop_hook_active ?? payload.stopHookActive
    );
    const partialEvent = {
      type,
      harness: "copilot",
      conversationId,
      workspacePath,
      prompt,
      isStop,
      stopHookActive,
      isInterrupted: false,
      latestMessage: null,
      rawPayload: payload
    };
    partialEvent.latestMessage = this.extractLatestMessage(partialEvent);
    return partialEvent;
  },
  extractLatestMessage: defaultExtractLatestMessage,
  formatEgress(event, response) {
    if (event.type === "stop") {
      if (response.decision === "continue" && response.reason) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            decision: "block",
            reason: response.reason
          })
        };
      }
      return { exitCode: 0, stdout: "{}" };
    }
    if (event.type === "pre") {
      const text = response.injectSteps?.[0]?.ephemeralMessage || "";
      if (!text) {
        return { exitCode: 0, stdout: "{}" };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          additionalContext: text
        })
      };
    }
    return { exitCode: 0, stdout: JSON.stringify(response) };
  },
  resolveConversationId(env) {
    return env.COPILOT_SESSION_ID || null;
  },
  resolveStorageDir(env) {
    return env.COPILOT_PLUGIN_DATA || null;
  }
};

// src/harnesses/index.ts
var HARNESSES = [
  copilotHarness,
  codexHarness,
  claudeHarness,
  agyHarness
];
function detectHarness(payload = {}, env = process.env) {
  for (const harness of HARNESSES) {
    if (harness.detect(payload, env)) {
      return harness.id;
    }
  }
  return null;
}
function getHarness(type) {
  const harness = HARNESSES.find((h) => h.id === type);
  (0, import_strict.default)(harness, `Unknown harness type: ${type}`);
  return harness;
}
function resolveConversationIdFromHarnesses(env = process.env) {
  for (const harness of HARNESSES) {
    const conversationId = harness.resolveConversationId?.(env);
    if (conversationId) {
      return conversationId;
    }
  }
  return null;
}
function resolveStorageDirFromHarnesses(env = process.env) {
  for (const harness of HARNESSES) {
    const dir = harness.resolveStorageDir?.(env);
    if (dir) {
      return dir;
    }
  }
  return null;
}

// src/resolver.ts
var fs2 = __toESM(require("node:fs"), 1);
var path = __toESM(require("node:path"), 1);

// src/parser.ts
var import_strict2 = __toESM(require("node:assert/strict"), 1);
var DELIMITER_REGEX = /^##\s*<curtain(?::(auto|gate|pause))?>\s*$/gim;
function parseScript(content, filePath) {
  (0, import_strict2.default)(typeof content === "string", "Script content must be a string");
  (0, import_strict2.default)(filePath.trim().length > 0, "filePath must be provided");
  const matches = [];
  let match = DELIMITER_REGEX.exec(content);
  while (match !== null) {
    const subtype = match[1]?.toLowerCase();
    matches.push({
      index: match.index,
      length: match[0].length,
      type: subtype === "gate" || subtype === "pause" ? "pause" : "auto"
    });
    match = DELIMITER_REGEX.exec(content);
  }
  const steps = [];
  if (matches.length === 0) {
    const trimmed = content.trim();
    (0, import_strict2.default)(
      trimmed.length > 0,
      `Script file "${filePath}" contains no content.`
    );
    steps.push({
      index: 0,
      type: "auto",
      content: trimmed
    });
    return { filePath, steps };
  }
  let lastEnd = 0;
  let currentType = "auto";
  for (const m of matches) {
    const chunk = content.slice(lastEnd, m.index).trim();
    if (chunk.length > 0) {
      steps.push({
        index: steps.length,
        type: currentType,
        content: chunk
      });
    }
    currentType = m.type;
    lastEnd = m.index + m.length;
  }
  const finalChunk = content.slice(lastEnd).trim();
  if (finalChunk.length > 0) {
    steps.push({
      index: steps.length,
      type: currentType,
      content: finalChunk
    });
  }
  (0, import_strict2.default)(
    steps.length > 0,
    `Script file "${filePath}" contains no executable steps.`
  );
  return { filePath, steps };
}

// src/resolver.ts
function resolveScriptPath(userPath, workspacePaths) {
  let cleanPath = userPath.trim();
  const bracketMatch = cleanPath.match(/^@\[([^\]]+)\]$/);
  if (bracketMatch) {
    cleanPath = bracketMatch[1].trim();
  } else {
    if (cleanPath.startsWith("@")) {
      cleanPath = cleanPath.slice(1).trim();
    }
    const quoteMatch = cleanPath.match(/^["']([^"']+)["']$/);
    if (quoteMatch) {
      cleanPath = quoteMatch[1].trim();
    }
  }
  function checkCandidate(candidatePath) {
    try {
      if (fs2.existsSync(candidatePath) && fs2.statSync(candidatePath).isFile()) {
        return candidatePath;
      }
      if (!path.extname(candidatePath)) {
        for (const ext of [".md", ".markdown"]) {
          const candidate = candidatePath + ext;
          if (fs2.existsSync(candidate) && fs2.statSync(candidate).isFile()) {
            return candidate;
          }
        }
      }
    } catch {
    }
    return null;
  }
  if (path.isAbsolute(cleanPath)) {
    const found = checkCandidate(cleanPath);
    if (found) return found;
  }
  if (workspacePaths && workspacePaths.length > 0) {
    for (const ws of workspacePaths) {
      const resolved = checkCandidate(path.resolve(ws, cleanPath));
      if (resolved) return resolved;
    }
  }
  const cwdResolved = checkCandidate(path.resolve(process.cwd(), cleanPath));
  if (cwdResolved) return cwdResolved;
  return null;
}
function loadScript(targetPath, workspacePaths) {
  const resolved = resolveScriptPath(targetPath, workspacePaths);
  if (!resolved) return null;
  try {
    const content = fs2.readFileSync(resolved, "utf-8");
    const script = parseScript(content, resolved);
    return { filePath: resolved, script };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to load script "${targetPath}": ${message}` };
  }
}

// src/lib/parseCommand.ts
function parseFilePath(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const bracketMatch = trimmed.match(/^@\[([^\]]+)\]/);
  if (bracketMatch) return bracketMatch[1].trim();
  const quoteMatch = trimmed.match(/^["']([^"']+)["']/);
  if (quoteMatch) return quoteMatch[1].trim();
  const atMatch = trimmed.match(/^@(\S+)/);
  if (atMatch) return atMatch[1].trim();
  return trimmed.split(/\s+/)[0];
}
function parseCommand(input) {
  if (!input) return { isCurtainCommand: false };
  const trimmed = input.trim();
  const match = trimmed.match(
    /^(?:\/curtain|\$curtain(?::curtain)?|\$curtain)(?:[:\s-]+(.*)|$)/i
  );
  if (!match) {
    return { isCurtainCommand: false };
  }
  const rest = (match[1] ?? "").trim();
  if (!rest) {
    return { isCurtainCommand: true, command: { name: "status" } };
  }
  const tokens = rest.split(/\s+/);
  const sub = tokens[0].toLowerCase();
  if (sub === "raise" || sub === "next") {
    return { isCurtainCommand: true, command: { name: "raise" } };
  }
  if (sub === "drop" || sub === "stop" || sub === "abort") {
    return { isCurtainCommand: true, command: { name: "drop" } };
  }
  if (sub === "status") {
    return { isCurtainCommand: true, command: { name: "status" } };
  }
  if (sub === "help") {
    return { isCurtainCommand: true, command: { name: "help" } };
  }
  if (sub === "run" || sub === "start") {
    const filePath2 = parseFilePath(rest.slice(sub.length));
    if (!filePath2) {
      return {
        isCurtainCommand: true,
        error: "Missing required script path argument."
      };
    }
    return { isCurtainCommand: true, command: { name: "run", path: filePath2 } };
  }
  const filePath = parseFilePath(rest);
  if (filePath) {
    return { isCurtainCommand: true, command: { name: "run", path: filePath } };
  }
  return { isCurtainCommand: true, command: { name: "help" } };
}
function getHelpText() {
  return [
    "Curtain Commands:",
    "  /curtain <file.md>      Start execution of a multi-act script",
    "  /curtain raise          Advance to next step when paused at a curtain",
    "  /curtain drop           Stop execution and reset state",
    "  /curtain status         Display current step and runner status",
    "  /curtain help           Display this help message"
  ].join("\n");
}

// src/state.ts
var import_strict3 = __toESM(require("node:assert/strict"), 1);
var fs3 = __toESM(require("node:fs"), 1);
var os = __toESM(require("node:os"), 1);
var path2 = __toESM(require("node:path"), 1);
function getStorageBaseDir(env = process.env) {
  return resolveStorageDirFromHarnesses(env) || path2.join(os.tmpdir(), "curtain");
}
function getStatePath(conversationId, env = process.env) {
  (0, import_strict3.default)(conversationId.trim().length > 0, "conversationId must not be empty");
  return path2.join(
    getStorageBaseDir(env),
    conversationId,
    "curtain-state.json"
  );
}
function getDebugLogPath(conversationId, env = process.env) {
  const base = getStorageBaseDir(env);
  return conversationId ? path2.join(base, conversationId, "debug.log") : path2.join(base, "debug.log");
}
function loadState(conversationId, env = process.env) {
  try {
    const filePath = getStatePath(conversationId, env);
    if (!fs3.existsSync(filePath)) return null;
    const raw = fs3.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || typeof data.script !== "string" || data.status !== "running" && data.status !== "paused" || typeof data.currentStep !== "number" || typeof data.totalSteps !== "number" || !Array.isArray(data.steps)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
function saveState(conversationId, state, env = process.env) {
  const filePath = getStatePath(conversationId, env);
  const dir = path2.dirname(filePath);
  if (!fs3.existsSync(dir)) {
    fs3.mkdirSync(dir, { recursive: true });
  }
  fs3.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}
function deleteState(conversationId, env = process.env) {
  try {
    const filePath = getStatePath(conversationId, env);
    if (fs3.existsSync(filePath)) {
      fs3.unlinkSync(filePath);
    }
  } catch {
  }
}

// src/transitions.ts
var import_strict4 = __toESM(require("node:assert/strict"), 1);
function startExecution(script) {
  (0, import_strict4.default)(script.steps.length > 0, "Cannot start script with no steps");
  return {
    script: script.filePath,
    status: "running",
    currentStep: 0,
    totalSteps: script.steps.length,
    steps: script.steps
  };
}
function resumeExecution(state) {
  (0, import_strict4.default)(state, "State must be provided to resume");
  if (state.status !== "paused") {
    return {
      success: false,
      error: "The curtain is not currently paused."
    };
  }
  const nextStepIndex = state.currentStep + 1;
  if (nextStepIndex >= state.totalSteps) {
    return {
      success: false,
      error: "All steps have already been completed."
    };
  }
  const nextStep = state.steps[nextStepIndex];
  return {
    success: true,
    state: {
      ...state,
      currentStep: nextStepIndex,
      status: "running"
    },
    step: nextStep
  };
}
function advanceExecution(state) {
  (0, import_strict4.default)(state, "State must be provided to advance");
  (0, import_strict4.default)(state.status === "running", "Cannot advance when not running");
  const nextStepIndex = state.currentStep + 1;
  if (nextStepIndex >= state.totalSteps) {
    return { action: "finish" };
  }
  const nextStep = state.steps[nextStepIndex];
  if (nextStep.type === "pause") {
    return {
      action: "pause",
      state: {
        ...state,
        status: "paused"
      }
    };
  }
  return {
    action: "advance",
    state: {
      ...state,
      currentStep: nextStepIndex,
      status: "running"
    },
    step: nextStep
  };
}

// src/handlers/pre.ts
function handlePre(info, state, env = process.env) {
  const userInput = info.latestMessage?.type === "USER_INPUT" ? info.latestMessage.content : info.prompt;
  if (userInput) {
    const parsed = parseCommand(userInput);
    if (parsed.isCurtainCommand) {
      if (parsed.error) {
        return {
          state,
          response: { injectSteps: [{ ephemeralMessage: parsed.error }] }
        };
      }
      if (!parsed.command || parsed.command.name === "help") {
        return {
          state,
          response: { injectSteps: [{ ephemeralMessage: getHelpText() }] }
        };
      }
      if (parsed.command.name === "status") {
        const msg = state ? `[CURTAIN STATUS] Step ${state.currentStep + 1}/${state.totalSteps} | State: ${state.status} | Script: ${state.script}` : "[CURTAIN STATUS] No active script running.";
        return {
          state,
          response: { injectSteps: [{ ephemeralMessage: msg }] }
        };
      }
      if (parsed.command.name === "drop") {
        deleteState(info.conversationId, env);
        return {
          state: null,
          response: {
            injectSteps: [
              { ephemeralMessage: "Curtain dropped. Execution stopped." }
            ]
          }
        };
      }
      if (parsed.command.name === "raise") {
        if (!state) {
          return {
            state: null,
            response: {
              injectSteps: [
                { ephemeralMessage: "No script is currently loaded." }
              ]
            }
          };
        }
        const res = resumeExecution(state);
        if (!res.success) {
          return {
            state,
            response: {
              injectSteps: [{ ephemeralMessage: res.error }]
            }
          };
        }
        saveState(info.conversationId, res.state, env);
        const msg = `[STEP ${res.state.currentStep + 1} OF ${res.state.totalSteps}]

${res.step.content}

Perform ONLY this step. Conclude when complete.`;
        return {
          state: res.state,
          response: { injectSteps: [{ ephemeralMessage: msg }] }
        };
      }
      if (parsed.command.name === "run") {
        const loaded = loadScript(parsed.command.path, [info.workspacePath]);
        if (!loaded || "error" in loaded) {
          const err = !loaded ? `Script file not found: "${parsed.command.path}"` : loaded.error;
          return {
            state,
            response: { injectSteps: [{ ephemeralMessage: err }] }
          };
        }
        const nextState = startExecution(loaded.script);
        saveState(info.conversationId, nextState, env);
        const firstStep = nextState.steps[0];
        const msg = `[STEP 1 OF ${nextState.totalSteps}]

${firstStep.content}

Perform ONLY this step. Conclude when complete.`;
        return {
          state: nextState,
          response: { injectSteps: [{ ephemeralMessage: msg }] }
        };
      }
    }
  }
  return { state, response: {} };
}

// src/handlers/stop.ts
function handleStop(info, state, env = process.env) {
  if (!state) {
    return { state: null, response: { decision: "allow" } };
  }
  if (state.status === "paused") {
    return { state, response: { decision: "allow" } };
  }
  if (info.terminationReason && /cancel|abort|interrupt/i.test(info.terminationReason)) {
    return { state, response: { decision: "allow" } };
  }
  const result = advanceExecution(state);
  if (result.action === "finish") {
    deleteState(info.conversationId, env);
    return { state: null, response: { decision: "allow" } };
  }
  if (result.action === "pause") {
    saveState(info.conversationId, result.state, env);
    return { state: result.state, response: { decision: "allow" } };
  }
  saveState(info.conversationId, result.state, env);
  const msg = `[STEP ${result.state.currentStep + 1} OF ${result.state.totalSteps}]

${result.step.content}

Perform ONLY this step. Conclude when complete.`;
  return {
    state: result.state,
    response: {
      decision: "continue",
      reason: msg
    }
  };
}

// src/handlers/index.ts
function handle(info, state, env = process.env) {
  if (info.type === "stop") {
    return handleStop(info, state, env);
  }
  if (info.type === "pre") {
    return handlePre(info, state, env);
  }
  throw new Error(`Unknown hook type: ${info.type}`);
}

// src/lib/logDebug.ts
var fs4 = __toESM(require("node:fs"), 1);
var path3 = __toESM(require("node:path"), 1);
function logDebug(message, data) {
  if (process.env.VITEST && !process.env.CURTAIN_DEBUG) {
    return;
  }
  const line = `[${(logDebug.conversationId ?? "unknown").split("-")[0]}] ${message} ${data !== void 0 ? JSON.stringify(data, null, 2) : ""}
`;
  try {
    const filePath = getDebugLogPath(logDebug.conversationId);
    fs4.mkdirSync(path3.dirname(filePath), { recursive: true });
    fs4.appendFileSync(filePath, line);
  } catch {
  }
}
logDebug.conversationId = void 0;

// src/shim/stdin.ts
function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}
function parseJsonSafe(raw) {
  const clean = stripBom(raw).trim();
  if (!clean) return {};
  try {
    return JSON.parse(clean);
  } catch {
    return {};
  }
}
function readStdin(timeoutMs = 1e3, stream = process.stdin) {
  return new Promise((resolve2) => {
    let buffer = "";
    let settled = false;
    function onData(chunk) {
      if (settled) return;
      buffer += chunk.toString();
    }
    function done() {
      if (settled) return;
      settled = true;
      stream.removeListener("data", onData);
      stream.removeListener("end", done);
      stream.removeListener("error", done);
      clearTimeout(timer);
      resolve2(stripBom(buffer));
    }
    stream.on("data", onData);
    stream.on("end", done);
    stream.on("error", done);
    const timer = setTimeout(done, timeoutMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
}

// src/shim/runtime-shim.ts
async function runShim(modeArg, rawInput, env = process.env) {
  const input = rawInput !== void 0 ? rawInput : await readStdin();
  const payload = parseJsonSafe(input);
  const harnessId = detectHarness(payload, env);
  if (!harnessId) {
    return { exitCode: 0 };
  }
  const adapter = getHarness(harnessId);
  const event = adapter.normalize(payload, modeArg, env);
  logDebug.conversationId = event.conversationId;
  const hookInfo = {
    type: event.type === "stop" ? "stop" : "pre",
    conversationId: event.conversationId,
    workspacePath: event.workspacePath,
    prompt: event.prompt,
    terminationReason: event.terminationReason,
    latestMessage: event.latestMessage
  };
  const state = loadState(event.conversationId, env);
  const { response } = handle(hookInfo, state, env);
  return adapter.formatEgress(event, response);
}

// src/cli.ts
function getCliHelp() {
  return [
    "curtain - Minimal Multi-Act Instruction Runner for AI Agents",
    "",
    "Usage:",
    "  curtain <file.md>        Start execution of a multi-act script",
    "  curtain start <file.md>  Start execution of a multi-act script",
    "  curtain raise            Advance to next step when paused at a curtain",
    "  curtain drop             Stop execution and reset state",
    "  curtain status           Display current step and runner status",
    "  curtain hook <event>     Execute harness lifecycle hook (pre, stop)",
    "  curtain help             Show this help reference",
    "",
    "Options:",
    "  -h, --help               Show help",
    "  -v, --version            Show version"
  ].join("\n");
}
function parseCliArgs(args = process.argv.slice(2)) {
  const { values, positionals } = (0, import_node_util.parseArgs)({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" }
    },
    allowPositionals: true,
    strict: false
  });
  return {
    command: positionals[0],
    subcommand: positionals[1],
    args: positionals.slice(1),
    options: values
  };
}
var defaultIo = {
  writeOut: (msg) => console.log(msg),
  writeErr: (msg) => console.error(msg)
};
async function runCli(args = process.argv.slice(2), io = defaultIo, env = process.env) {
  const parsed = parseCliArgs(args);
  const { writeOut, writeErr } = io;
  if (parsed.options.help || parsed.command === "help") {
    const helpText2 = getCliHelp();
    writeOut(helpText2);
    return { exitCode: 0, output: helpText2 };
  }
  if (parsed.options.version || parsed.command === "version") {
    const version = "0.2.0";
    writeOut(version);
    return { exitCode: 0, output: version };
  }
  if (parsed.command === "hook") {
    const modeArg = parsed.subcommand ?? "stop";
    const egress = await runShim(modeArg, void 0, env);
    if (egress.stdout) writeOut(egress.stdout);
    if (egress.stderr) writeErr(egress.stderr);
    return { exitCode: egress.exitCode, output: egress.stdout };
  }
  const conversationId = resolveConversationIdFromHarnesses(env) ?? "default";
  const cwd = env.PWD || process.cwd();
  if (parsed.command === "drop" || parsed.command === "stop" || parsed.command === "abort") {
    deleteState(conversationId, env);
    const msg = "[CURTAIN DROPPED] Execution stopped.";
    writeOut(msg);
    return { exitCode: 0, output: msg };
  }
  if (parsed.command === "status") {
    const state = loadState(conversationId, env);
    const msg = state ? `[CURTAIN STATUS] Step ${state.currentStep + 1}/${state.totalSteps} | State: ${state.status} | Script: ${state.script}` : "[CURTAIN STATUS] No active script running.";
    writeOut(msg);
    return { exitCode: 0, output: msg };
  }
  if (parsed.command === "raise" || parsed.command === "next") {
    const state = loadState(conversationId, env);
    if (!state) {
      const err = "No script is currently loaded. Start with 'curtain <script.md>'.";
      writeErr(err);
      return { exitCode: 1, output: err };
    }
    const res = resumeExecution(state);
    if (!res.success) {
      writeErr(res.error);
      return { exitCode: 1, output: res.error };
    }
    saveState(conversationId, res.state, env);
    const msg = `[STEP ${res.state.currentStep + 1} OF ${res.state.totalSteps}]

${res.step.content}

Perform ONLY this step. Conclude when complete.`;
    writeOut(msg);
    return { exitCode: 0, output: msg };
  }
  const isStartCommand = parsed.command === "start" || parsed.command === "run";
  const filePathCandidate = isStartCommand ? parsed.args[0] : parsed.command;
  if (filePathCandidate) {
    const loaded = loadScript(filePathCandidate, [cwd]);
    if (!loaded || "error" in loaded) {
      const err = !loaded ? `Script file not found: "${filePathCandidate}"` : loaded.error;
      writeErr(err);
      return { exitCode: 1, output: err };
    }
    const nextState = startExecution(loaded.script);
    saveState(conversationId, nextState, env);
    const firstStep = nextState.steps[0];
    const msg = `[STEP 1 OF ${nextState.totalSteps}]

${firstStep.content}

Perform ONLY this step. Conclude when complete.`;
    writeOut(msg);
    return { exitCode: 0, output: msg };
  }
  const helpText = getCliHelp();
  writeOut(helpText);
  return { exitCode: 0, output: helpText };
}
var isDirectExecution = Boolean(process.argv[1]?.endsWith("curtain.cjs")) || Boolean(process.argv[1]?.endsWith("cli.ts"));
if (isDirectExecution && !process.env.VITEST) {
  runCli().then((res) => {
    if (res.exitCode !== 0) {
      process.exit(res.exitCode);
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getCliHelp,
  parseCliArgs,
  runCli
});
