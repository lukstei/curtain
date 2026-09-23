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

// src/lib/markdown/parsing.ts
function parse(markdown) {
  return MarkdownParser.parse(markdown);
}
var MismatchError = class _MismatchError extends Error {
  constructor() {
    super("Mismatched token");
    Object.setPrototypeOf(this, _MismatchError.prototype);
  }
};
var MarkdownParser = class _MarkdownParser {
  chars;
  index = 0;
  static NEWLINE = ["\r\n", "\r", "\n"];
  static NEW_PARAGRAPH = _MarkdownParser.NEWLINE.flatMap(
    (prefix) => _MarkdownParser.NEWLINE.map((suffix) => prefix + suffix)
  );
  constructor(input) {
    this.chars = [...input];
  }
  static parse(input) {
    return new _MarkdownParser(input).parseNext();
  }
  parseNext(end = "") {
    const root = {
      type: "fragment",
      children: [],
      source: ""
    };
    const startIndex = this.index;
    let text = "";
    let lastBlockIndex = 0;
    let paragraphStartIndex = this.index;
    let textStartIndex = this.index;
    const flushParagraph = (endIndex) => {
      if (text !== "") {
        const trimmedText = text.replace(/[\r\n]+$/, "");
        const trailingLen = text.length - trimmedText.length;
        const contentEndIndex = endIndex - trailingLen;
        if (trimmedText !== "") {
          root.children.push({
            type: "text",
            content: trimmedText,
            source: this.getSlice(textStartIndex, contentEndIndex)
          });
        }
        text = "";
        endIndex = contentEndIndex;
      }
      const inlineChildren = root.children.splice(lastBlockIndex);
      if (inlineChildren.length > 0) {
        const paragraph = {
          type: "paragraph",
          children: inlineChildren,
          source: this.getSlice(paragraphStartIndex, endIndex)
        };
        root.children.push(paragraph);
      }
      lastBlockIndex = root.children.length;
    };
    while (!this.done) {
      const escapedText = this.parseText("");
      if (escapedText !== "") {
        text += escapedText;
        continue;
      }
      if (end !== "" && (this.matches(end) || this.matches(..._MarkdownParser.NEWLINE))) {
        break;
      }
      const codeBlockMatch = end === "" && this.atLineStart() ? this.matchCodeBlockPrefix() : null;
      if (codeBlockMatch !== null) {
        flushParagraph(this.index);
        const node2 = this.parseCodeBlock(codeBlockMatch);
        root.children.push(node2);
        lastBlockIndex = root.children.length;
        paragraphStartIndex = this.index;
        textStartIndex = this.index;
        continue;
      }
      const blockquoteMatch = end === "" && this.atLineStart() ? this.matchBlockquotePrefix() : false;
      if (blockquoteMatch) {
        flushParagraph(this.index);
        const node2 = this.parseBlockquote();
        root.children.push(node2);
        lastBlockIndex = root.children.length;
        paragraphStartIndex = this.index;
        textStartIndex = this.index;
        continue;
      }
      const headingMatch = end === "" && this.atLineStart() ? this.matchHeadingPrefix() : null;
      if (headingMatch !== null) {
        flushParagraph(this.index);
        const headingStartIndex = this.index;
        this.advance(headingMatch.prefixLength);
        const inlines = this.parseNext("\n");
        const children = inlines.type === "fragment" ? inlines.children : [inlines];
        const headingEndIndex = this.index;
        this.stripTrailingHeadingHashes(children);
        while (_MarkdownParser.NEWLINE.includes(this.current)) {
          this.advance();
        }
        root.children.push({
          type: "heading",
          depth: headingMatch.depth,
          children,
          source: this.getSlice(headingStartIndex, headingEndIndex)
        });
        lastBlockIndex = root.children.length;
        paragraphStartIndex = this.index;
        textStartIndex = this.index;
        continue;
      }
      if (this.matches(..._MarkdownParser.NEW_PARAGRAPH)) {
        const paragraphEndIndex = this.index;
        while (_MarkdownParser.NEWLINE.includes(this.current)) {
          this.advance();
        }
        flushParagraph(paragraphEndIndex);
        paragraphStartIndex = this.index;
        textStartIndex = this.index;
        continue;
      }
      const nodeStartIndex = this.index;
      let node = null;
      try {
        node = this.parseCurrent();
      } catch (error) {
        if (!(error instanceof MismatchError)) {
          throw error;
        }
      }
      if (node === null) {
        this.seek(nodeStartIndex);
        text += this.current;
        this.advance();
        continue;
      }
      if (text !== "") {
        root.children.push({
          type: "text",
          content: text,
          source: this.getSlice(textStartIndex, nodeStartIndex)
        });
      }
      text = "";
      textStartIndex = this.index;
      root.children.push(node);
    }
    if (lastBlockIndex > 0) {
      flushParagraph(this.index);
    } else {
      if (text !== "") {
        root.children.push({
          type: "text",
          content: text,
          source: this.getSlice(textStartIndex, this.index)
        });
      }
    }
    if (root.children.length === 1) {
      return root.children[0];
    }
    root.source = this.getSlice(startIndex, this.index);
    return root;
  }
  stripTrailingHeadingHashes(children) {
    const last = children[children.length - 1];
    if (last?.type === "text") {
      last.content = last.content.replace(/\s+#+\s*$/, "");
      if (!last.content.trim()) {
        children.pop();
      }
    }
  }
  parseCurrent() {
    const char = this.lookAhead();
    const startIndex = this.index;
    switch (char) {
      case "*":
      case "_": {
        const delimiter = this.matches("**") ? "**" : char;
        this.advance(delimiter.length);
        const children = this.parseNext(delimiter);
        this.match(delimiter);
        return {
          type: delimiter.length === 1 ? "italic" : "bold",
          children,
          source: this.getSlice(startIndex, this.index)
        };
      }
      case "~": {
        this.match("~~");
        const children = this.parseNext("~~");
        this.match("~~");
        return {
          type: "strike",
          children,
          source: this.getSlice(startIndex, this.index)
        };
      }
      case "`": {
        if (this.matches("```")) {
          return null;
        }
        const delimiter = this.matches("``") ? "``" : "`";
        this.match(delimiter);
        const content = this.parseText(delimiter).trim();
        if (this.matches("```")) {
          return null;
        }
        this.match(delimiter);
        return {
          type: "code",
          content,
          source: this.getSlice(startIndex, this.index)
        };
      }
      case "!": {
        this.advance();
        this.match("[");
        const alt = this.parseText("]");
        this.match("](");
        const src = this.parseText(")");
        this.match(")");
        return {
          type: "image",
          src,
          alt,
          source: this.getSlice(startIndex, this.index)
        };
      }
      case "[": {
        this.advance();
        const label = this.parseNext("]");
        this.match("](");
        const href = this.parseText(")", '"');
        let title;
        if (this.matches('"')) {
          this.match('"');
          title = this.parseText('"');
          this.match('"');
        }
        this.match(")");
        return {
          type: "link",
          href: href.trim(),
          ...title !== void 0 ? { title } : {},
          children: label,
          source: this.getSlice(startIndex, this.index)
        };
      }
      default:
        return null;
    }
  }
  parseText(...end) {
    let text = "";
    while (!this.done) {
      if (this.current === "\\" && this.index + 1 < this.length) {
        this.advance();
        text += this.current;
        this.advance();
        continue;
      }
      if (end.some((token) => token === "" || this.matches(token)) || this.matches(..._MarkdownParser.NEWLINE)) {
        break;
      }
      text += this.current;
      this.advance();
    }
    return text;
  }
  atLineStart() {
    if (this.index === 0) return true;
    const prev = this.chars[this.index - 1];
    return prev === "\n" || prev === "\r";
  }
  matchHeadingPrefix() {
    if (!this.atLineStart()) return null;
    const slice = this.getSlice(this.index, this.index + 64);
    const match = slice.match(/^[ ]{0,3}(#{1,6})(?:[ \t]+|(?=[\r\n]|$))/);
    if (!match) return null;
    return { depth: match[1].length, prefixLength: match[0].length };
  }
  getLineEnd(fromIndex) {
    let i = fromIndex;
    while (i < this.length && this.chars[i] !== "\n" && this.chars[i] !== "\r") {
      i++;
    }
    return i;
  }
  getNewlineLength(index) {
    if (index >= this.length) return 0;
    if (this.chars[index] === "\r" && this.chars[index + 1] === "\n") return 2;
    if (this.chars[index] === "\n" || this.chars[index] === "\r") return 1;
    return 0;
  }
  matchCodeBlockPrefix() {
    if (!this.atLineStart()) return null;
    let indent = 0;
    while (indent < 3 && this.chars[this.index + indent] === " ") {
      indent++;
    }
    const char = this.chars[this.index + indent];
    if (char !== "`" && char !== "~") return null;
    const openLineEnd = this.getLineEnd(this.index);
    const line = this.getSlice(this.index, openLineEnd);
    const match = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ \t]*(\S*)/);
    if (!match) return null;
    const fence = match[1];
    const fenceChar = fence[0];
    if (fenceChar === "`" && line.slice(indent + fence.length).includes("`")) {
      return null;
    }
    return {
      fenceChar,
      fenceLength: fence.length,
      language: match[2] !== "" ? match[2] : void 0,
      openLineEnd
    };
  }
  parseCodeBlock(info) {
    const blockStartIndex = this.index;
    const openNewlineLen = this.getNewlineLength(info.openLineEnd);
    let cursor = info.openLineEnd + openNewlineLen;
    const contentStartIndex = cursor;
    const closingRegex = new RegExp(
      `^[ ]{0,3}\\${info.fenceChar}{${info.fenceLength},}[ \\t]*$`
    );
    let contentEndIndex = this.length;
    let blockEndIndex = this.length;
    let closingFound = false;
    while (cursor < this.length) {
      const curLineEnd = this.getLineEnd(cursor);
      const curLine = this.getSlice(cursor, curLineEnd);
      if (closingRegex.test(curLine)) {
        closingFound = true;
        contentEndIndex = cursor;
        blockEndIndex = curLineEnd;
        cursor = curLineEnd + this.getNewlineLength(curLineEnd);
        break;
      }
      const nlLen = this.getNewlineLength(curLineEnd);
      if (nlLen === 0) {
        cursor = curLineEnd;
        break;
      }
      cursor = curLineEnd + nlLen;
    }
    if (!closingFound) {
      contentEndIndex = this.length;
      blockEndIndex = this.length;
    }
    this.seek(cursor);
    while (_MarkdownParser.NEWLINE.includes(this.current)) {
      this.advance();
    }
    const content = this.getSlice(contentStartIndex, contentEndIndex);
    const source = this.getSlice(blockStartIndex, blockEndIndex);
    return {
      type: "codeblock",
      ...info.language !== void 0 ? { language: info.language } : {},
      content,
      source
    };
  }
  matchBlockquotePrefix() {
    if (!this.atLineStart()) return false;
    let indent = 0;
    while (indent < 3 && this.chars[this.index + indent] === " ") {
      indent++;
    }
    return this.chars[this.index + indent] === ">";
  }
  parseBlockquote() {
    const blockquoteStartIndex = this.index;
    const innerLines = [];
    let cursor = this.index;
    let lastLineEnd = cursor;
    while (cursor < this.length) {
      let lineIndent = 0;
      while (lineIndent < 3 && this.chars[cursor + lineIndent] === " ") {
        lineIndent++;
      }
      if (this.chars[cursor + lineIndent] !== ">") {
        break;
      }
      const curLineEnd = this.getLineEnd(cursor);
      const rawLine = this.getSlice(cursor, curLineEnd);
      const strippedLine = rawLine.replace(/^[ ]{0,3}>[ \t]?/, "");
      innerLines.push(strippedLine);
      lastLineEnd = curLineEnd;
      const nlLen = this.getNewlineLength(curLineEnd);
      if (nlLen === 0) {
        cursor = curLineEnd;
        break;
      }
      cursor = curLineEnd + nlLen;
    }
    this.seek(cursor);
    while (_MarkdownParser.NEWLINE.includes(this.current)) {
      this.advance();
    }
    const innerContent = innerLines.join("\n");
    let children = [];
    if (innerContent.trim() !== "") {
      const parsed = _MarkdownParser.parse(innerContent);
      children = parsed.type === "fragment" ? parsed.children : [parsed];
    }
    const source = this.getSlice(blockquoteStartIndex, lastLineEnd);
    return {
      type: "blockquote",
      children,
      source
    };
  }
  get done() {
    return this.index >= this.length;
  }
  get length() {
    return this.chars.length;
  }
  get current() {
    return this.chars[this.index];
  }
  advance(length = 1) {
    this.index += length;
  }
  seek(index) {
    this.index = index;
  }
  matches(...lookahead) {
    return lookahead.some(
      (substring) => this.lookAhead(substring.length) === substring
    );
  }
  match(...lookahead) {
    for (const substring of lookahead) {
      if (this.lookAhead(substring.length) === substring) {
        this.advance(substring.length);
        return;
      }
    }
    throw new MismatchError();
  }
  lookAhead(length = 1) {
    if (length === 1) {
      return this.current;
    }
    return this.getSlice(this.index, this.index + length);
  }
  getSlice(start, end) {
    return this.chars.slice(start, end).join("");
  }
};

// src/parser.ts
var CALLOUT_REGEX = /^[ \t]*\[!(CURTAIN|INTERMISSION)\][ \t]*(.*)$/i;
function getDelimiterInfo(node) {
  if (node.type !== "blockquote") {
    return null;
  }
  const rawLines = node.source.split(/\r?\n/).map((line) => line.replace(/^[ ]{0,3}>[ \t]?/, ""));
  const match = CALLOUT_REGEX.exec(rawLines[0]);
  if (!match) {
    return null;
  }
  const type = match[1].toLowerCase() === "curtain" ? "auto" : "pause";
  const fullInstruction = [match[2], ...rawLines.slice(1)].join("\n").trim();
  const instruction = fullInstruction.length > 0 ? fullInstruction : void 0;
  return {
    type,
    ...instruction ? { instruction } : {}
  };
}
function parseScript(content, filePath) {
  (0, import_strict2.default)(typeof content === "string", "Script content must be a string");
  (0, import_strict2.default)(filePath.trim().length > 0, "filePath must be provided");
  const trimmed = content.trim();
  (0, import_strict2.default)(trimmed.length > 0, `Script file "${filePath}" contains no content.`);
  const ast = parse(content);
  const topLevelBlocks = ast.type === "fragment" ? ast.children : [ast];
  const steps = [];
  let currentBlocks = [];
  for (const block of topLevelBlocks) {
    const delimiter = getDelimiterInfo(block);
    if (delimiter !== null) {
      (0, import_strict2.default)(
        currentBlocks.length > 0,
        `Curtain delimiters cannot appear consecutively or at the beginning of script "${filePath}".`
      );
      const chunk = currentBlocks.map((b) => b.source).join("\n\n").trim();
      if (chunk.length > 0) {
        steps.push({
          index: steps.length,
          type: delimiter.type,
          content: chunk,
          ...delimiter.instruction ? { instruction: delimiter.instruction } : {}
        });
      }
      currentBlocks = [];
    } else {
      currentBlocks.push(block);
    }
  }
  if (currentBlocks.length > 0) {
    const chunk = currentBlocks.map((b) => b.source).join("\n\n").trim();
    if (chunk.length > 0) {
      steps.push({
        index: steps.length,
        type: "auto",
        content: chunk
      });
    }
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
  if (/^[/$]next$/i.test(trimmed)) {
    return { isCurtainCommand: true, command: { name: "next" } };
  }
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
  if (sub === "next") {
    return { isCurtainCommand: true, command: { name: "next" } };
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
    "  /next                   Advance to next step when paused at an intermission",
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
      action: "error",
      error: "The curtain is not currently paused."
    };
  }
  const nextStepIndex = state.currentStep + 1;
  if (nextStepIndex >= state.totalSteps) {
    return { action: "finish" };
  }
  const nextStep = state.steps[nextStepIndex];
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
function advanceExecution(state) {
  (0, import_strict4.default)(state, "State must be provided to advance");
  (0, import_strict4.default)(state.status === "running", "Cannot advance when not running");
  const currentStep = state.steps[state.currentStep];
  if (currentStep?.type === "pause") {
    return {
      action: "pause",
      state: {
        ...state,
        status: "paused"
      }
    };
  }
  const nextStepIndex = state.currentStep + 1;
  if (nextStepIndex >= state.totalSteps) {
    return { action: "finish" };
  }
  const nextStep = state.steps[nextStepIndex];
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
function formatStepPrompt(step, totalSteps) {
  const criteria = step.instruction ? `[${step.type === "pause" ? "INTERMISSION" : "TRANSITION"} CRITERIA]
${step.instruction}

` : "";
  const pauseNotice = step.type === "pause" ? " When concluding your turn, inform the user that only /next will proceed." : "";
  return `[STEP ${step.index + 1} OF ${totalSteps}]

${step.content}

${criteria}Perform ONLY this step. Conclude when complete.${pauseNotice}`;
}
function formatStatus(state) {
  if (!state) {
    return "[CURTAIN STATUS] No active script running.";
  }
  const currentStep = state.steps[state.currentStep];
  const firstLineInstruction = currentStep?.instruction?.split(/\r?\n/)[0]?.trim();
  const intermissionPart = state.status === "paused" && firstLineInstruction ? ` | Intermission: ${firstLineInstruction}` : "";
  return `[CURTAIN STATUS] Step ${state.currentStep + 1}/${state.totalSteps} | State: ${state.status} | Script: ${state.script}${intermissionPart}`;
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
        const msg = formatStatus(state);
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
      if (parsed.command.name === "next") {
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
        if (res.action === "error") {
          return {
            state,
            response: {
              injectSteps: [{ ephemeralMessage: res.error }]
            }
          };
        }
        if (res.action === "finish") {
          deleteState(info.conversationId, env);
          return {
            state: null,
            response: {
              injectSteps: [{ ephemeralMessage: "Execution complete." }]
            }
          };
        }
        saveState(info.conversationId, res.state, env);
        const msg = formatStepPrompt(res.step, res.state.totalSteps);
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
        const msg = formatStepPrompt(firstStep, nextState.totalSteps);
        return {
          state: nextState,
          response: { injectSteps: [{ ephemeralMessage: msg }] }
        };
      }
    }
  }
  if (state?.status === "paused") {
    const currentStep = state.steps[state.currentStep];
    const criteriaPart = currentStep?.instruction ? `${currentStep.instruction}

` : "";
    const msg = `[INTERMISSION REVIEW]
${criteriaPart}Conclude your turn when complete. The curtain remains paused until the user enters /next. Inform the user that only /next will proceed.`;
    return {
      state,
      response: {
        injectSteps: [{ ephemeralMessage: msg }]
      }
    };
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
  const msg = formatStepPrompt(result.step, result.state.totalSteps);
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
    "  curtain next             Advance to next step when paused at an intermission",
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
    const msg = formatStatus(state);
    writeOut(msg);
    return { exitCode: 0, output: msg };
  }
  if (parsed.command === "next") {
    const state = loadState(conversationId, env);
    if (!state) {
      const err = "No script is currently loaded. Start with 'curtain <script.md>'.";
      writeErr(err);
      return { exitCode: 1, output: err };
    }
    const res = resumeExecution(state);
    if (res.action === "error") {
      writeErr(res.error);
      return { exitCode: 1, output: res.error };
    }
    if (res.action === "finish") {
      deleteState(conversationId, env);
      const msg2 = "[CURTAIN STATUS] Execution complete.";
      writeOut(msg2);
      return { exitCode: 0, output: msg2 };
    }
    saveState(conversationId, res.state, env);
    const msg = formatStepPrompt(res.step, res.state.totalSteps);
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
    const msg = formatStepPrompt(firstStep, nextState.totalSteps);
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
