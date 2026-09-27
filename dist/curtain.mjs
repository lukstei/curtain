#!/usr/bin/env node

// src/cli.ts
import { parseArgs } from "node:util";

// src/harnesses/agy.ts
import * as os2 from "node:os";
import * as path7 from "node:path";

// src/actions.ts
import assert4 from "node:assert/strict";
import * as fs5 from "node:fs";
import * as path5 from "node:path";

// src/lib/assertNever.ts
function assertNever(x) {
  throw new Error(`Never assertion failed: ${JSON.stringify(x)}`);
}

// src/lib/parseCommand.ts
import * as path4 from "node:path";

// src/resolver/index.ts
import * as fs4 from "node:fs";

// src/parser/index.ts
import assert from "node:assert/strict";

// src/parser/markdown.ts
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

// src/parser/index.ts
var CALLOUT_ANNOTATION_REGEX = /(?:^|\s)>\s*\[!(CURTAIN|INTERMISSION)\]/im;
var CALLOUT_LINE_REGEX = /^[ \t]*\[!(CURTAIN|INTERMISSION)\][ \t]*(.*)$/i;
var BLOCKQUOTE_PREFIX_REGEX = /^[ ]{0,3}>[ \t]?/;
var LINE_SPLIT_REGEX = /\r?\n/;
function getDelimiterInfo(node) {
  if (node.type !== "blockquote") {
    return null;
  }
  const rawLines = node.source.split(LINE_SPLIT_REGEX).map((line) => line.replace(BLOCKQUOTE_PREFIX_REGEX, ""));
  const match = CALLOUT_LINE_REGEX.exec(rawLines[0]);
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
  assert(typeof content === "string", "Script content must be a string");
  assert(filePath.trim().length > 0, "filePath must be provided");
  const trimmed = content.trim();
  assert(trimmed.length > 0, `Script file "${filePath}" contains no content.`);
  const ast = parse(content);
  const topLevelBlocks = ast.type === "fragment" ? ast.children : [ast];
  const steps = [];
  let currentBlocks = [];
  for (const block of topLevelBlocks) {
    const delimiter = getDelimiterInfo(block);
    if (delimiter !== null) {
      assert(
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
  assert(
    steps.length > 0,
    `Script file "${filePath}" contains no executable steps.`
  );
  return { filePath, steps };
}

// src/resolver/resolveSkill.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";

// src/lib/logDebug.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";

// src/state.ts
import assert2 from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
function getStorageBaseDir(env = process.env) {
  return resolveStorageDirFromHarnesses(env) || path.join(os.tmpdir(), "curtain");
}
function getStatePath(conversationId, env = process.env) {
  assert2(conversationId.trim().length > 0, "conversationId must not be empty");
  return path.join(
    getStorageBaseDir(env),
    conversationId,
    "curtain-state.json"
  );
}
function getDebugLogPath(conversationId, env = process.env) {
  const base = getStorageBaseDir(env);
  return conversationId ? path.join(base, conversationId, "debug.log") : path.join(base, "debug.log");
}
function getHookLogPath(conversationId, env = process.env) {
  assert2(conversationId.trim().length > 0, "conversationId must not be empty");
  return path.join(getStorageBaseDir(env), conversationId, "hooks.jsonl");
}
function isValidStep(step) {
  if (!step || typeof step !== "object") return false;
  const s = step;
  return typeof s.index === "number" && (s.type === "auto" || s.type === "pause") && typeof s.content === "string";
}
function loadState(conversationId, env = process.env) {
  const filePath = getStatePath(conversationId, env);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || typeof data.script !== "string" || data.status !== "running" && data.status !== "paused" || typeof data.currentStep !== "number" || !Array.isArray(data.steps) || !data.steps.every(isValidStep)) {
      logDebug(`Corrupt state schema at ${filePath}`);
      return null;
    }
    return data;
  } catch (err) {
    const isEnoent = err.code === "ENOENT";
    if (!isEnoent) {
      logDebug(`Failed to read state file at ${filePath}`, err);
    }
    return null;
  }
}
function saveState(conversationId, state, env = process.env) {
  const filePath = getStatePath(conversationId, env);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}
function deleteState(conversationId, env = process.env) {
  const filePath = getStatePath(conversationId, env);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    const isEnoent = err.code === "ENOENT";
    if (!isEnoent) {
      logDebug(`Failed to delete state file at ${filePath}`, err);
    }
  }
}

// src/lib/logDebug.ts
function logDebug(message, data) {
  if (process.env.VITEST && !process.env.CURTAIN_DEBUG) {
    return;
  }
  const line = `[${(logDebug.conversationId ?? "unknown").split("-")[0]}] ${message} ${data !== void 0 ? JSON.stringify(data, null, 2) : ""}
`;
  try {
    const filePath = getDebugLogPath(logDebug.conversationId);
    fs2.mkdirSync(path2.dirname(filePath), { recursive: true });
    fs2.appendFileSync(filePath, line);
  } catch {
  }
}
logDebug.conversationId = void 0;

// src/resolver/resolveSkill.ts
function findSkillInBaseDir(baseDir, skillName, maxDepth = 3) {
  if (!fs3.existsSync(baseDir)) return null;
  const direct = path3.join(baseDir, skillName, "SKILL.md");
  if (fs3.existsSync(direct) && fs3.statSync(direct).isFile()) {
    return direct;
  }
  const directMd = path3.join(baseDir, `${skillName}.md`);
  if (fs3.existsSync(directMd) && fs3.statSync(directMd).isFile()) {
    return directMd;
  }
  if (maxDepth <= 0) return null;
  try {
    const entries = fs3.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const sub = path3.join(baseDir, entry.name);
      const pluginSkill = path3.join(sub, "skills", skillName, "SKILL.md");
      if (fs3.existsSync(pluginSkill) && fs3.statSync(pluginSkill).isFile()) {
        return pluginSkill;
      }
      const nestedDirect = path3.join(sub, skillName, "SKILL.md");
      if (fs3.existsSync(nestedDirect) && fs3.statSync(nestedDirect).isFile()) {
        return nestedDirect;
      }
      const deeper = findSkillInBaseDir(sub, skillName, maxDepth - 1);
      if (deeper) return deeper;
    }
  } catch (err) {
    const isEnoent = err.code === "ENOENT";
    if (!isEnoent) {
      logDebug(`Failed to read directory at ${baseDir}`, err);
    }
  }
  return null;
}
function resolveSkillPath(skill, harness, workspacePaths = ["."], _env = process.env) {
  const skillName = skill.name.trim();
  if (!skillName) return null;
  const adapter = getHarness(harness);
  if (!adapter.getSkillDirs) return null;
  const uniqueDirs = [...new Set(adapter.getSkillDirs(workspacePaths))];
  for (const dir of uniqueDirs) {
    const found = findSkillInBaseDir(dir, skillName);
    if (found) {
      return found;
    }
  }
  return null;
}
function checkPlaybookPath(resolvedPath) {
  if (fs3.existsSync(resolvedPath)) {
    const stat = fs3.statSync(resolvedPath);
    if (stat.isDirectory()) {
      const directPlaybook = path3.join(resolvedPath, "PLAYBOOK.md");
      if (fs3.existsSync(directPlaybook) && fs3.statSync(directPlaybook).isFile()) {
        return directPlaybook;
      }
    } else if (stat.isFile()) {
      if (path3.basename(resolvedPath).toUpperCase() === "PLAYBOOK.MD") {
        return resolvedPath;
      }
      if (path3.basename(resolvedPath).toUpperCase() === "SKILL.MD") {
        const sibling = path3.join(path3.dirname(resolvedPath), "PLAYBOOK.md");
        if (fs3.existsSync(sibling) && fs3.statSync(sibling).isFile()) {
          return sibling;
        }
      }
    }
  }
  return null;
}
function resolvePlaybookPath(skill, harness, workspacePaths = ["."], env = process.env) {
  if (skill.path) {
    if (path3.isAbsolute(skill.path)) {
      return checkPlaybookPath(skill.path);
    }
    for (const wp of workspacePaths) {
      const resolvedPath = path3.resolve(wp, skill.path);
      const found = checkPlaybookPath(resolvedPath);
      if (found) return found;
    }
    return null;
  }
  const skillPath = resolveSkillPath(skill, harness, workspacePaths, env);
  if (skillPath) {
    const skillDir = path3.dirname(skillPath);
    const playbook = path3.join(skillDir, "PLAYBOOK.md");
    if (fs3.existsSync(playbook) && fs3.statSync(playbook).isFile()) {
      return playbook;
    }
  }
  return null;
}

// src/resolver/parseSkill.ts
function formatSkill(skill) {
  return skill.namespace ? `${skill.namespace}:${skill.name}` : skill.name;
}
var MD_SIGIL_REGEX = /^\[\$([a-zA-Z0-9_.:-]+)\](?:\([^)]*\))?$/;
var SIGIL_CMD_REGEX = /^[/$]([a-zA-Z0-9_.:-]+)$/;
var NAMESPACED_REGEX = /^([a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+)$/;
function extractRawSkill(raw) {
  const trimmed = raw.trim();
  const md = trimmed.match(MD_SIGIL_REGEX);
  if (md) return md[1];
  const sigil = trimmed.match(SIGIL_CMD_REGEX);
  if (sigil) return sigil[1];
  const ns = trimmed.match(NAMESPACED_REGEX);
  if (ns) return ns[1];
  return null;
}
function parseSkill(raw) {
  const rawSkill = extractRawSkill(raw);
  if (!rawSkill) return null;
  const parts = rawSkill.toLowerCase().split(":");
  if (parts.length > 2) return null;
  if (parts.length === 2) {
    const [namespace, name2] = parts;
    if (!namespace || !name2) return null;
    return { namespace, name: name2 };
  }
  const [name] = parts;
  return name === "next" ? { namespace: "curtain", name } : { name };
}
function normalizeSkillName(raw) {
  const parsed = parseSkill(raw);
  return parsed ? formatSkill(parsed) : "";
}

// src/resolver/index.ts
function loadSkillScript(skill, workspacePaths, harness) {
  const playbookPath = resolvePlaybookPath(skill, harness, workspacePaths);
  if (!playbookPath) {
    return null;
  }
  try {
    const content = fs4.readFileSync(playbookPath, "utf-8");
    if (!CALLOUT_ANNOTATION_REGEX.test(content)) return null;
    const script = parseScript(content, playbookPath);
    return script.steps.length > 1 ? script : null;
  } catch {
    return null;
  }
}
function resolveIntentScript(intent, workspacePaths, harness) {
  if (intent.type === "skill") {
    const script = loadSkillScript(intent.skill, workspacePaths, harness);
    if (script) {
      return { type: "resolved", script, skillName: intent.skill.name };
    }
  }
  return { type: "none" };
}

// src/lib/parseCommand.ts
var WHITESPACE_SPLIT_REGEX = /\s+/;
function resolveSkillNameFromPath(skillPath) {
  if (!skillPath) return null;
  const fileName = path4.basename(skillPath);
  if (fileName.toLowerCase() === "skill.md") {
    return path4.basename(path4.dirname(skillPath)).toLowerCase();
  }
  return null;
}
function parseCommand(input, skillInvocationPath) {
  const trimmed = input?.trim();
  if (trimmed) {
    const token = trimmed.split(WHITESPACE_SPLIT_REGEX)[0];
    const parsed = parseSkill(token);
    if (parsed) {
      if (parsed.namespace === "curtain" && parsed.name === "next") {
        return { type: "next" };
      }
      return {
        type: "skill",
        skill: parsed
      };
    }
  }
  if (skillInvocationPath) {
    const name = resolveSkillNameFromPath(skillInvocationPath);
    if (name === "next") return { type: "next" };
    if (name) {
      return {
        type: "skill",
        skill: { name, path: skillInvocationPath }
      };
    }
  }
  return { type: "none" };
}

// src/transitions.ts
import assert3 from "node:assert/strict";
function startExecution(script, skillName) {
  assert3(script.steps.length > 0, "Cannot start script with no steps");
  return {
    script: script.filePath,
    status: "running",
    currentStep: 0,
    steps: script.steps,
    ...skillName !== void 0 ? { skillName } : {}
  };
}
function resumeExecution(state) {
  assert3(state, "State must be provided to resume");
  if (state.status !== "paused") {
    return {
      action: "error",
      error: "The curtain is not currently paused."
    };
  }
  const nextStepIndex = state.currentStep + 1;
  if (nextStepIndex >= state.steps.length) {
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
  assert3(state, "State must be provided to advance");
  assert3(state.status === "running", "Cannot advance when not running");
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
  if (nextStepIndex >= state.steps.length) {
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
function formatIntermissionPrompt(instruction) {
  const criteriaPart = instruction ? `${instruction}

` : "";
  return [
    "[INTERMISSION REVIEW]",
    criteriaPart ? criteriaPart.trim() : null,
    "Execution is PAUSED at an intermission for human review.",
    "- Follow and execute all instructions, adjustments, or questions given by the user in their prompt.",
    "- Present your completed work or findings clearly for the user to review, using the review sidebar artifact if applicable.",
    "- Do NOT execute, advance to, or anticipate any DOWNSTREAM or FUTURE steps from the playbook script.",
    "- Do NOT attempt to invoke runner tools or /next yourself; only the user can advance execution by typing /next.",
    "- Remind the user that execution remains paused at this intermission and only typing /next will advance to the next playbook step."
  ].filter(Boolean).join("\n\n");
}
var CURTAIN_INFO = "Curtain is an orchestration tool running a multi-act playbook. Only the current act is revealed; downstream acts are withheld until prior acts complete.";
function formatStepPrompt(step, totalSteps) {
  const criteria = step.instruction ? `

[${step.type === "pause" ? "INTERMISSION" : "TRANSITION"} CRITERIA]
${step.instruction}` : "";
  const rules = [
    "- Perform ONLY the instructions in <act-instructions>.",
    "- Conclude when complete.",
    "- Do NOT anticipate or execute any future steps.",
    ...step.type === "pause" ? [
      "- When concluding your turn, summarize your work in the review sidebar/artifact (if available).",
      "- Inform the user that execution is paused for review, and remind them that only typing /next will advance to the next step.",
      "- Do NOT invoke runner tools or /next yourself."
    ] : []
  ].join("\n");
  return [
    `[STEP ${step.index + 1} OF ${totalSteps}]`,
    `<curtain-info>
${CURTAIN_INFO}
</curtain-info>`,
    `<act-instructions>
${step.content}${criteria}
</act-instructions>`,
    `<rules>
${rules}
</rules>`
  ].join("\n\n");
}
function executeStart(script, skillName) {
  const nextState = startExecution(script, skillName);
  const firstStep = nextState.steps[0];
  const message = formatStepPrompt(firstStep, nextState.steps.length);
  return { nextState, message };
}
function executeResume(state) {
  const res = resumeExecution(state);
  if (res.action === "error") {
    return {
      action: "error",
      nextState: state,
      message: res.error
    };
  }
  if (res.action === "finish") {
    return {
      action: "finish",
      nextState: null,
      message: "Execution complete."
    };
  }
  return {
    action: "advance",
    nextState: res.state,
    message: formatStepPrompt(res.step, res.state.steps.length)
  };
}

// src/actions.ts
var TERMINATION_CANCEL_REGEX = /cancel|abort|interrupt/i;
function isSameFile(p1, p2) {
  if (p1 === p2) return true;
  const r1 = path5.resolve(p1);
  const r2 = path5.resolve(p2);
  if (r1 === r2) return true;
  try {
    return fs5.realpathSync(r1) === fs5.realpathSync(r2);
  } catch {
    return false;
  }
}
function advanceTurn(params) {
  if (params.state.status === "paused") {
    return { action: "allow", nextState: params.state };
  }
  if (params.terminationReason && TERMINATION_CANCEL_REGEX.test(params.terminationReason)) {
    return { action: "allow", nextState: params.state };
  }
  const result = advanceExecution(params.state);
  if (result.action === "finish") {
    return { action: "allow", nextState: null };
  }
  if (result.action === "pause") {
    return { action: "allow", nextState: result.state };
  }
  const message = formatStepPrompt(result.step, result.state.steps.length);
  return {
    action: "continue",
    message,
    nextState: result.state
  };
}
function resumePlaybook(state) {
  if (state.status !== "paused") {
    return {
      action: "error",
      message: "BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review.",
      nextState: state
    };
  }
  const res = executeResume(state);
  if (res.action === "error") {
    return {
      action: "error",
      message: res.message,
      nextState: res.nextState
    };
  }
  return {
    action: "resumed",
    message: res.message,
    nextState: res.nextState
  };
}
function startPlaybook(script, skillName) {
  const res = executeStart(script, skillName);
  return {
    action: "started",
    message: res.message,
    nextState: res.nextState
  };
}
function resolveUserPrompt(params) {
  const intent = parseCommand(params.prompt, params.skillInvocationPath);
  switch (intent.type) {
    case "next": {
      if (!params.state) {
        return {
          action: "error",
          message: "BLOCKED BY CURTAIN: No script is currently loaded.",
          nextState: null
        };
      }
      const res = resumePlaybook(params.state);
      if (res.action === "error") {
        return {
          action: "error",
          message: res.message,
          nextState: res.nextState
        };
      }
      return {
        action: "resume",
        message: res.message,
        nextState: res.nextState
      };
    }
    case "skill": {
      if (params.state) {
        return { action: "pass", nextState: params.state };
      }
      const resolved = resolveIntentScript(
        intent,
        params.workspacePaths,
        params.harness
      );
      if (resolved.type === "resolved") {
        const res = startPlaybook(
          resolved.script,
          resolved.skillName ?? intent.skill.name
        );
        return {
          action: "start",
          message: res.message,
          nextState: res.nextState
        };
      }
      return { action: "pass", nextState: null };
    }
    case "none":
      break;
    default:
      return assertNever(intent);
  }
  if (params.state?.status === "paused") {
    const currentStep = params.state.steps[params.state.currentStep];
    return {
      action: "intermission_nudge",
      message: formatIntermissionPrompt(currentStep?.instruction),
      nextState: params.state
    };
  }
  return { action: "pass", nextState: params.state };
}
function guardBackstageRead(params) {
  assert4(params.readPath.length > 0, "readPath must not be empty");
  const script = params.state.script;
  if (path5.isAbsolute(script)) {
    if (isSameFile(params.readPath, script)) {
      return {
        blocked: true,
        reason: `BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect ${path5.basename(script)}.`
      };
    }
  }
  for (const wp of params.workspacePaths) {
    if (isSameFile(params.readPath, path5.resolve(wp, script))) {
      return {
        blocked: true,
        reason: `BLOCKED BY CURTAIN: You are executing this skill behind curtains. Step instructions are already provided in your context. Do not inspect ${path5.basename(script)}.`
      };
    }
  }
  return { blocked: false };
}
function guardSkillInvocation(params) {
  const parsed = parseSkill(params.skillTarget);
  if (parsed?.namespace === "curtain" && parsed.name === "next") {
    return {
      blocked: true,
      reason: "BLOCKED BY CURTAIN: You cannot advance execution at an intermission. Only the user can advance execution by typing /next. Conclude your turn and wait for user review."
    };
  }
  if (params.state.skillName) {
    const active = params.state.skillName.toLowerCase();
    const target = params.skillTarget.toLowerCase();
    if (target === active || parsed && (parsed.name === active || formatSkill(parsed) === active)) {
      return {
        blocked: true,
        reason: "BLOCKED BY CURTAIN: Playbook execution is already active. Do not invoke the active skill via the Skill tool. Execute the active step instructions directly."
      };
    }
  }
  return { blocked: false };
}
function resolveSkillInvocation(params) {
  if (params.skillName === "next") {
    if (!params.state) {
      return {
        action: "block",
        message: "BLOCKED BY CURTAIN: No script is currently loaded.",
        nextState: null
      };
    }
    const res = resumePlaybook(params.state);
    if (res.action === "error") {
      return {
        action: "block",
        message: res.message,
        nextState: res.nextState
      };
    }
    return {
      action: "resume",
      message: res.message,
      nextState: res.nextState
    };
  }
  if (params.state) {
    const guard = guardSkillInvocation({
      skillTarget: params.skillName,
      state: params.state
    });
    if (guard.blocked) {
      return {
        action: "block",
        message: guard.reason,
        nextState: params.state
      };
    }
    return { action: "pass", nextState: params.state };
  }
  const script = loadSkillScript(
    { name: params.skillName, path: params.skillPath },
    params.workspacePaths,
    params.harness
  );
  if (script) {
    const res = startPlaybook(script, params.skillName);
    return {
      action: "start",
      message: res.message,
      nextState: res.nextState
    };
  }
  return { action: "pass", nextState: null };
}

// src/harnesses/common.ts
import * as fs6 from "node:fs";
import * as path6 from "node:path";
function getGenericSkillDirs(workspacePaths) {
  return workspacePaths.flatMap((wp) => [
    path6.join(wp, ".agents/skills"),
    path6.join(wp, "skills")
  ]);
}
function extractToolCall(payload) {
  if (payload.toolCall && typeof payload.toolCall === "object" && "name" in payload.toolCall) {
    const tc = payload.toolCall;
    return { name: tc.name, args: tc.args ?? {} };
  }
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : typeof payload.toolName === "string" ? payload.toolName : void 0;
  if (toolName) {
    const rawArgs = payload.tool_input ?? payload.toolInput ?? payload.args ?? payload.arguments;
    const args = typeof rawArgs === "object" && rawArgs !== null ? rawArgs : {};
    return { name: toolName, args };
  }
  return null;
}
function resolveToolReadPath(rawPath, workspacePaths) {
  const target = typeof rawPath === "string" ? rawPath.trim() : "";
  if (path6.isAbsolute(target)) {
    return target;
  }
  for (const wp of workspacePaths) {
    const resolved = path6.resolve(wp, target);
    if (fs6.existsSync(resolved)) {
      return resolved;
    }
  }
  return path6.resolve(workspacePaths[0] ?? ".", target);
}
function defaultExtractSkillTarget(toolCall) {
  if (toolCall.name === "Skill" || toolCall.name === "invoke_skill" || toolCall.name.endsWith("__Skill")) {
    const skill = toolCall.args.skill ?? toolCall.args.name ?? toolCall.args.skill_name;
    return typeof skill === "string" ? normalizeSkillName(skill) : null;
  }
  return null;
}

// src/harnesses/agy.ts
function parseAgyEvent(payload, mode) {
  if (mode === "pre") {
    return { kind: "pre" };
  }
  if (mode === "stop") {
    const terminationReason = typeof payload.terminationReason === "string" ? payload.terminationReason : null;
    return { kind: "stop", terminationReason };
  }
  const rawToolCall = payload.toolCall;
  const toolCall = rawToolCall && typeof rawToolCall === "object" && "name" in rawToolCall ? rawToolCall : null;
  const workspacePaths = Array.isArray(payload.workspacePaths) ? payload.workspacePaths.map(String) : [];
  const targetPath = typeof toolCall?.args?.AbsolutePath === "string" ? toolCall.args.AbsolutePath.trim() : null;
  return {
    kind: "tool",
    toolName: toolCall?.name ?? "",
    targetPath,
    workspacePaths
  };
}
function agyResult(decision, nextState, reason) {
  const stdout = decision === "pass" ? "{}" : JSON.stringify({ decision, ...reason && { reason } });
  return { egress: { exitCode: 0, stdout }, nextState };
}
var agyHarness = {
  id: "agy",
  detect(_payload, env) {
    return Boolean(
      env.AGY_HOOK_ACTIVE || env.ANTIGRAVITY_CONVERSATION_ID || env.GEMINI_CLI === "1" || env.ANTIGRAVITY === "1"
    );
  },
  resolveConversationId(payload, env) {
    return String(
      payload.conversationId ?? env.ANTIGRAVITY_CONVERSATION_ID ?? "default"
    );
  },
  handle(payload, ctx) {
    const event = parseAgyEvent(payload, ctx.mode);
    switch (event.kind) {
      case "pre":
        return agyResult("pass", ctx.state);
      case "stop": {
        if (!ctx.state) {
          return agyResult("allow", null);
        }
        const res = advanceTurn({
          state: ctx.state,
          terminationReason: event.terminationReason
        });
        if (res.action === "continue") {
          return agyResult("continue", res.nextState, res.message);
        }
        return agyResult("allow", res.nextState);
      }
      case "tool": {
        if (event.toolName !== "view_file" || !event.targetPath) {
          return agyResult("allow", ctx.state);
        }
        const targetPath = resolveToolReadPath(
          event.targetPath,
          event.workspacePaths
        );
        if (ctx.state) {
          const backstage = guardBackstageRead({
            readPath: targetPath,
            state: ctx.state,
            workspacePaths: event.workspacePaths
          });
          if (backstage.blocked) {
            return agyResult("deny", ctx.state, backstage.reason);
          }
        }
        const skillName = resolveSkillNameFromPath(targetPath);
        if (!skillName) {
          return agyResult("allow", ctx.state);
        }
        const outcome = resolveSkillInvocation({
          skillName,
          skillPath: targetPath,
          state: ctx.state,
          workspacePaths: event.workspacePaths,
          harness: "agy"
        });
        if (outcome.action === "start" || outcome.action === "resume" || outcome.action === "block") {
          return agyResult("deny", outcome.nextState, outcome.message);
        }
        return agyResult("allow", outcome.nextState);
      }
    }
  },
  getSkillDirs(workspacePaths) {
    const home = os2.homedir();
    return [
      ...getGenericSkillDirs(workspacePaths),
      ...workspacePaths.map((wp) => path7.join(wp, ".agents/plugins")),
      path7.join(home, ".gemini/config/skills"),
      path7.join(home, ".gemini/config/plugins"),
      path7.join(home, ".gemini/antigravity/builtin/skills")
    ];
  }
};

// src/harnesses/claude.ts
import assert5 from "node:assert/strict";
import * as os3 from "node:os";
import * as path8 from "node:path";
function parseClaudeEvent(payload, mode) {
  if (mode === "pre") {
    if (typeof payload.prompt === "string" && payload.prompt.trim()) {
      assert5(typeof payload.cwd === "string", "Claude payload requires cwd");
      return { kind: "prompt", prompt: payload.prompt, cwd: payload.cwd };
    }
    return { kind: "session_start" };
  }
  if (mode === "stop") {
    return { kind: "stop" };
  }
  const toolCall = extractToolCall(payload);
  assert5(toolCall, "Missing tool call in tool event");
  assert5(typeof payload.cwd === "string", "Claude payload requires cwd");
  return { kind: "tool", toolCall, cwd: payload.cwd };
}
function formatPromptEgress(res) {
  if (res.action === "start" || res.action === "resume" || res.action === "intermission_nudge") {
    return {
      egress: {
        exitCode: 0,
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: res.message
          }
        })
      },
      nextState: res.nextState
    };
  }
  if (res.action === "error") {
    return {
      egress: {
        exitCode: 2,
        stderr: res.message
      },
      nextState: res.nextState
    };
  }
  return {
    egress: { exitCode: 0, stdout: "{}" },
    nextState: res.nextState
  };
}
function formatStopEgress(res) {
  if (res.action === "continue") {
    return {
      egress: {
        exitCode: 0,
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: res.message
          }
        })
      },
      nextState: res.nextState
    };
  }
  return {
    egress: { exitCode: 0, stdout: "{}" },
    nextState: res.nextState
  };
}
function extractFileReadTarget(toolCall, cwd) {
  const isReadTool = toolCall.name === "read_file" || toolCall.name === "view_file" || toolCall.name === "Read" || toolCall.name === "View" || toolCall.name === "mcp__filesystem__read_file" || toolCall.name.endsWith("__read_file") || toolCall.name.endsWith("__view_file");
  if (!isReadTool) return null;
  const rawPath = toolCall.args.file_path ?? toolCall.args.path ?? toolCall.args.filePath ?? toolCall.args.AbsolutePath;
  return typeof rawPath === "string" ? resolveToolReadPath(rawPath, [cwd]) : null;
}
function extractClaudeSkillTarget(toolCall) {
  if (toolCall.name === "Skill" || toolCall.name.endsWith("__Skill")) {
    const raw = toolCall.args.skill ?? toolCall.args.name;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    const target = trimmed.startsWith("/") || trimmed.startsWith("$") ? trimmed : `/${trimmed}`;
    return normalizeSkillName(target);
  }
  return null;
}
function handleToolEvent(event, ctx) {
  const skillName = extractClaudeSkillTarget(event.toolCall);
  if (skillName) {
    const outcome = resolveSkillInvocation({
      skillName,
      state: ctx.state,
      workspacePaths: [event.cwd],
      harness: "claude"
    });
    if (outcome.action === "start" || outcome.action === "resume" || outcome.action === "block") {
      return {
        egress: { exitCode: 2, stderr: outcome.message },
        nextState: outcome.nextState
      };
    }
    return {
      egress: { exitCode: 0, stdout: "{}" },
      nextState: outcome.nextState
    };
  }
  const readTargetPath = extractFileReadTarget(event.toolCall, event.cwd);
  if (readTargetPath && ctx.state) {
    const backstage = guardBackstageRead({
      readPath: readTargetPath,
      state: ctx.state,
      workspacePaths: [event.cwd]
    });
    if (backstage.blocked) {
      return {
        egress: { exitCode: 2, stderr: backstage.reason },
        nextState: ctx.state
      };
    }
  }
  return {
    egress: { exitCode: 0, stdout: "{}" },
    nextState: ctx.state
  };
}
var claudeHarness = {
  id: "claude",
  detect(payload, env) {
    if (env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_PLUGIN_DATA) return true;
    return payload.hook_event_name !== void 0 && payload.turn_id === void 0 && payload.timestamp === void 0;
  },
  resolveConversationId(payload, env) {
    return String(
      payload.session_id ?? env.CLAUDE_CODE_SESSION_ID ?? "default"
    );
  },
  handle(payload, ctx) {
    const event = parseClaudeEvent(payload, ctx.mode);
    switch (event.kind) {
      case "session_start":
        return { egress: { exitCode: 0, stdout: "{}" }, nextState: ctx.state };
      case "prompt": {
        const res = resolveUserPrompt({
          prompt: event.prompt,
          state: ctx.state,
          workspacePaths: [event.cwd],
          harness: "claude"
        });
        return formatPromptEgress(res);
      }
      case "stop": {
        if (!ctx.state) {
          return { egress: { exitCode: 0, stdout: "{}" }, nextState: null };
        }
        const res = advanceTurn({
          state: ctx.state,
          terminationReason: null
        });
        return formatStopEgress(res);
      }
      case "tool":
        return handleToolEvent(event, ctx);
    }
  },
  getSkillDirs(workspacePaths) {
    const home = os3.homedir();
    const dirs = [
      ...getGenericSkillDirs(workspacePaths),
      ...workspacePaths.flatMap((wp) => [
        path8.join(wp, ".claude/skills"),
        path8.join(wp, ".claude/plugins")
      ]),
      path8.join(home, ".claude/skills"),
      path8.join(home, ".claude/plugins/marketplaces"),
      path8.join(home, ".claude/plugins/cache")
    ];
    if (process.env.CLAUDE_PLUGIN_ROOT) {
      dirs.push(path8.join(process.env.CLAUDE_PLUGIN_ROOT, "skills"));
    }
    return dirs;
  }
};

// src/harnesses/codex.ts
import assert6 from "node:assert/strict";
import * as os4 from "node:os";
import * as path9 from "node:path";
var SKILL_LINK_PATH_CAPTURE_REGEX = /\[\$?([a-zA-Z0-9_.:-]+)\]\(([^)]+)\)/;
var XML_SKILL_PATH_REGEX = /<skill>[\s\S]*?<path>([^<]+)<\/path>[\s\S]*?<\/skill>/i;
var ANGLE_BRACKET_ENCLOSURE_REGEX = /^<|>$/g;
function extractCodexSkillPath(text, workspacePath) {
  const linkMatch = text.match(SKILL_LINK_PATH_CAPTURE_REGEX);
  if (linkMatch?.[2]) {
    const raw = linkMatch[2].replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "").trim();
    return resolveToolReadPath(raw, [workspacePath]);
  }
  const xmlMatch = text.match(XML_SKILL_PATH_REGEX);
  if (xmlMatch?.[1]) {
    const raw = xmlMatch[1].replace(ANGLE_BRACKET_ENCLOSURE_REGEX, "").trim();
    return resolveToolReadPath(raw, [workspacePath]);
  }
  return void 0;
}
function parseCodexEvent(payload, mode) {
  if (mode === "pre") {
    if (typeof payload.prompt === "string" && payload.prompt.trim()) {
      assert6(typeof payload.cwd === "string", "Codex payload requires cwd");
      return { kind: "prompt", prompt: payload.prompt, cwd: payload.cwd };
    }
    return { kind: "session_start" };
  }
  if (mode === "stop") {
    const terminationReason = typeof payload.terminationReason === "string" ? payload.terminationReason : null;
    return { kind: "stop", terminationReason };
  }
  const toolCall = extractToolCall(payload);
  assert6(toolCall, "Missing tool call in tool event");
  assert6(typeof payload.cwd === "string", "Codex payload requires cwd");
  return { kind: "tool", toolCall, cwd: payload.cwd };
}
function formatPromptEgress2(res) {
  if (res.action === "start" || res.action === "resume" || res.action === "intermission_nudge") {
    return {
      egress: {
        exitCode: 0,
        stdout: JSON.stringify({
          systemMessage: "[CURTAIN]",
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: res.message
          },
          suppressOutput: true
        })
      },
      nextState: res.nextState
    };
  }
  if (res.action === "error") {
    return {
      egress: {
        exitCode: 0,
        stdout: JSON.stringify({
          decision: "block",
          reason: res.message
        })
      },
      nextState: res.nextState
    };
  }
  return {
    egress: { exitCode: 0, stdout: "{}" },
    nextState: res.nextState
  };
}
function formatStopEgress2(res) {
  if (res.action === "continue") {
    return {
      egress: {
        exitCode: 0,
        stdout: JSON.stringify({
          decision: "block",
          reason: res.message,
          suppressOutput: true
        })
      },
      nextState: res.nextState
    };
  }
  return {
    egress: { exitCode: 0, stdout: "{}" },
    nextState: res.nextState
  };
}
function codexToolDeny(reason, nextState) {
  return {
    egress: {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason
        }
      })
    },
    nextState
  };
}
function codexToolAllow(nextState) {
  return {
    egress: { exitCode: 0, stdout: "{}" },
    nextState
  };
}
function extractFileReadTarget2(toolCall, cwd) {
  const isReadTool = toolCall.name === "read_file" || toolCall.name === "view_file" || toolCall.name === "Read" || toolCall.name === "View" || toolCall.name === "mcp__filesystem__read_file" || toolCall.name.endsWith("__read_file") || toolCall.name.endsWith("__view_file");
  if (!isReadTool) return null;
  const rawPath = toolCall.args.path ?? toolCall.args.file_path ?? toolCall.args.filePath ?? toolCall.args.AbsolutePath;
  return typeof rawPath === "string" ? resolveToolReadPath(rawPath, [cwd]) : null;
}
function handleToolEvent2(event, ctx) {
  const skillName = defaultExtractSkillTarget(event.toolCall);
  if (skillName) {
    const outcome = resolveSkillInvocation({
      skillName,
      state: ctx.state,
      workspacePaths: [event.cwd],
      harness: "codex"
    });
    if (outcome.action === "start" || outcome.action === "resume" || outcome.action === "block") {
      return codexToolDeny(outcome.message, outcome.nextState);
    }
    return codexToolAllow(outcome.nextState);
  }
  const readTargetPath = extractFileReadTarget2(event.toolCall, event.cwd);
  if (readTargetPath && ctx.state) {
    const backstage = guardBackstageRead({
      readPath: readTargetPath,
      state: ctx.state,
      workspacePaths: [event.cwd]
    });
    if (backstage.blocked) {
      return codexToolDeny(backstage.reason, ctx.state);
    }
  }
  return codexToolAllow(ctx.state);
}
var codexHarness = {
  id: "codex",
  detect(_payload, env) {
    return Boolean(env.CODEX_SESSION_ID || env.PLUGIN_DATA);
  },
  resolveConversationId(payload, env) {
    return String(payload.session_id ?? env.CODEX_SESSION_ID ?? "default");
  },
  handle(payload, ctx) {
    const event = parseCodexEvent(payload, ctx.mode);
    switch (event.kind) {
      case "session_start":
        return { egress: { exitCode: 0, stdout: "{}" }, nextState: ctx.state };
      case "prompt": {
        const skillInvocationPath = extractCodexSkillPath(
          event.prompt,
          event.cwd
        );
        const res = resolveUserPrompt({
          prompt: event.prompt,
          state: ctx.state,
          workspacePaths: [event.cwd],
          harness: "codex",
          skillInvocationPath
        });
        return formatPromptEgress2(res);
      }
      case "stop": {
        if (!ctx.state) {
          return { egress: { exitCode: 0, stdout: "{}" }, nextState: null };
        }
        const res = advanceTurn({
          state: ctx.state,
          terminationReason: event.terminationReason
        });
        return formatStopEgress2(res);
      }
      case "tool":
        return handleToolEvent2(event, ctx);
    }
  },
  getSkillDirs(workspacePaths) {
    const home = os4.homedir();
    return [
      ...getGenericSkillDirs(workspacePaths),
      ...workspacePaths.flatMap((wp) => [
        path9.join(wp, ".codex/skills"),
        path9.join(wp, ".codex/plugins")
      ]),
      path9.join(home, ".codex/skills"),
      path9.join(home, ".codex/plugins/cache"),
      path9.join(home, ".codex/plugins/marketplaces")
    ];
  }
};

// src/harnesses/copilot.ts
import * as os5 from "node:os";
import * as path10 from "node:path";
var copilotHarness = {
  id: "copilot",
  detect(payload, env) {
    return Boolean(
      env.COPILOT_PLUGIN_DATA || env.COPILOT_SESSION_ID || payload.timestamp !== void 0 && (payload.hook_event_name !== void 0 || payload.hookEventName !== void 0)
    );
  },
  resolveConversationId(payload, env) {
    return String(
      payload.sessionId ?? payload.session_id ?? payload.conversationId ?? env.COPILOT_SESSION_ID ?? "default"
    );
  },
  handle(_payload, ctx) {
    return {
      egress: { exitCode: 0, stdout: "{}" },
      nextState: ctx.state
    };
  },
  getSkillDirs(workspacePaths) {
    const home = os5.homedir();
    return [
      ...getGenericSkillDirs(workspacePaths),
      ...workspacePaths.flatMap((wp) => [
        path10.join(wp, ".github/skills"),
        path10.join(wp, ".claude/skills")
      ]),
      path10.join(home, ".copilot/skills"),
      path10.join(home, ".claude/skills"),
      path10.join(home, ".agents/skills")
    ];
  }
};

// src/harnesses/index.ts
function detectHarness(payload = {}, env = process.env) {
  const harnesses = [
    copilotHarness,
    codexHarness,
    claudeHarness,
    agyHarness
  ];
  for (const harness of harnesses) {
    if (harness.detect(payload, env)) {
      return harness.id;
    }
  }
  return null;
}
function getHarness(type) {
  switch (type) {
    case "copilot":
      return copilotHarness;
    case "codex":
      return codexHarness;
    case "claude":
      return claudeHarness;
    case "agy":
      return agyHarness;
  }
}
function resolveStorageDirFromHarnesses(env = process.env) {
  return env.COPILOT_PLUGIN_DATA || env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || env.AGY_PLUGIN_DATA || null;
}

// src/lib/logHook.ts
import * as fs7 from "node:fs";
import * as path11 from "node:path";
function logHookInvocation(conversationId, entry, env = process.env) {
  try {
    const filePath = getHookLogPath(conversationId, env);
    fs7.mkdirSync(path11.dirname(filePath), { recursive: true });
    fs7.appendFileSync(filePath, `${JSON.stringify(entry)}
`, "utf-8");
  } catch {
  }
}

// src/shim/stdin.ts
var UTF8_BOM_REGEX = /^\uFEFF/;
function stripBom(text) {
  return text.replace(UTF8_BOM_REGEX, "");
}
function parseJsonSafe(raw) {
  const clean = stripBom(raw).trim();
  if (!clean) return {};
  try {
    return JSON.parse(clean);
  } catch (err) {
    logDebug("Failed to parse stdin payload", {
      error: err instanceof Error ? err.message : String(err),
      input: clean.slice(0, 200)
    });
    return {};
  }
}
function readStdin(timeoutMs = 1e3, stream = process.stdin) {
  return new Promise((resolve5) => {
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
      resolve5(stripBom(buffer));
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
function executeHook(mode, payload, rawInput, env = process.env) {
  const harnessId = detectHarness(payload, env);
  if (!harnessId) {
    return { exitCode: 0 };
  }
  const adapter = getHarness(harnessId);
  const conversationId = adapter.resolveConversationId(payload, env);
  logDebug.conversationId = conversationId;
  const state = loadState(conversationId, env);
  const { egress, nextState } = adapter.handle(payload, {
    conversationId,
    state,
    mode,
    env
  });
  if (nextState === null) {
    if (state !== null) {
      deleteState(conversationId, env);
    }
  } else if (nextState !== state) {
    saveState(conversationId, nextState, env);
  }
  const isDebug = Boolean(env.CURTAIN_DEBUG ?? process.env.CURTAIN_DEBUG);
  if (isDebug) {
    const loggedState = nextState ? (({ steps, ...rest }) => rest)(nextState) : null;
    logHookInvocation(
      conversationId,
      {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        hook: mode,
        input: rawInput,
        output: egress.stdout ?? "{}",
        state: loggedState
      },
      env
    );
  }
  return egress;
}
async function runShim(mode, env = process.env) {
  const input = await readStdin();
  const payload = parseJsonSafe(input);
  return executeHook(mode, payload, input, env);
}

// src/version.ts
import * as fs8 from "node:fs";
import * as path12 from "node:path";
function getVersion() {
  try {
    const pkgPath = path12.resolve(import.meta.dirname, "../package.json");
    if (fs8.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs8.readFileSync(pkgPath, "utf-8"));
      if (typeof pkg.version === "string") {
        return pkg.version;
      }
    }
  } catch {
  }
  return "cannot parse version";
}

// src/cli.ts
function getCliHelp() {
  return [
    "curtain - Minimal Multi-Act Instruction Runner for AI Agents",
    "",
    "Usage:",
    "  curtain hook <event>     Execute harness lifecycle hook (pre, tool, stop)",
    "  curtain help             Show this help reference",
    "",
    "Options:",
    "  -h, --help               Show help",
    "  -v, --version            Show version"
  ].join("\n");
}
function parseCliArgs(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
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
  if (parsed.options.version || parsed.command === "version") {
    const version = getVersion();
    writeOut(version);
    return { exitCode: 0, output: version };
  }
  if (parsed.options.help || parsed.command === "help" || !parsed.command) {
    const helpText = getCliHelp();
    writeOut(helpText);
    return { exitCode: 0, output: helpText };
  }
  if (parsed.command === "hook") {
    const rawMode = parsed.subcommand ?? "stop";
    const mode = rawMode === "pre" || rawMode === "tool" || rawMode === "stop" ? rawMode : "stop";
    const egress = await runShim(mode, env);
    if (egress.stdout) writeOut(egress.stdout);
    if (egress.stderr) writeErr(egress.stderr);
    return { exitCode: egress.exitCode, output: egress.stdout };
  }
  const err = `Unknown command "${parsed.command}". Curtain is an agent lifecycle hook plugin. In chat, start a workflow with /<skill-name> and advance with /next.`;
  writeErr(err);
  return { exitCode: 1, output: err };
}
var isDirectExecution = Boolean(process.argv[1]?.endsWith("curtain.mjs")) || Boolean(process.argv[1]?.endsWith("cli.ts"));
if (isDirectExecution && !process.env.VITEST) {
  runCli().then((res) => {
    if (res.exitCode !== 0) {
      process.exit(res.exitCode);
    }
  });
}
export {
  getCliHelp,
  parseCliArgs,
  runCli
};
