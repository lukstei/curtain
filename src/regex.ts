/**
 * Centralized regular expressions used across the Curtain runner and harnesses.
 */

// -----------------------------------------------------------------------------
// Script Parsing & Callout Delimiters
// -----------------------------------------------------------------------------

/** Detects if a document contains at least one Curtain delimiter callout. */
export const CALLOUT_ANNOTATION_REGEX =
	/(?:^|\s)>\s*\[!(CURTAIN|INTERMISSION)\]/im;

/** Matches a callout line inside a blockquote, capturing delimiter type and criteria. */
export const CALLOUT_LINE_REGEX =
	/^[ \t]*\[!(CURTAIN|INTERMISSION)\][ \t]*(.*)$/i;

/** Strips leading blockquote `>` prefix and optional whitespace. */
export const BLOCKQUOTE_PREFIX_REGEX = /^[ ]{0,3}>[ \t]?/;

// -----------------------------------------------------------------------------
// Skill Invocation & Mention Matching
// -----------------------------------------------------------------------------

/** Matches a Markdown skill link with optional path and optional trailing arguments. */
export const SKILL_LINK_WITH_OPTIONAL_PATH_REGEX =
	/^\[\$?([a-zA-Z0-9_.:-]+)\](?:\(([^)]+)\))?(?:\s+([\s\S]*))?$/;

/** Extracts skill name and target file path from an embedded Markdown link mention. */
export const SKILL_LINK_PATH_CAPTURE_REGEX =
	/\[\$?([a-zA-Z0-9_.:-]+)\]\(([^)]+)\)/;

/** Matches a bare slash or dollar command invoking a skill (e.g. `/my-skill`, `$my-skill`). */
export const BARE_SKILL_COMMAND_REGEX = /^[/$]([a-zA-Z0-9_.:-]+)$/;

/** Extracts the skill file path from a `<skill><path>...</path></skill>` XML block. */
export const XML_SKILL_PATH_REGEX =
	/<skill>[\s\S]*?<path>([^<]+)<\/path>[\s\S]*?<\/skill>/i;

/** Extracts the skill file path from an Antigravity `<SKILL>` prompt block. */
export const AGY_SKILL_PATH_REGEX =
	/<SKILL>[\s\S]*?The path to the skill file is:\s*([^<]+?)<\/SKILL>/i;

/** Strips enclosing `<` and `>` angle brackets from paths in Markdown links. */
export const ANGLE_BRACKET_ENCLOSURE_REGEX = /^<|>$/g;

// -----------------------------------------------------------------------------
// Command Parsing & Argument Extraction
// -----------------------------------------------------------------------------

/** Matches runner command prefix (/ or $ or /curtain: or $curtain:) and extracts the command name and rest. */
export const COMMAND_REGEX = /^([/$]curtain[:\s]+|[/$])([^\s]+)(?:\s+(.*))?$/i;
export const CURTAIN_COMMAND_REGEX = COMMAND_REGEX;

/** Extracts a bracketed file path argument prefixed with `@` (e.g. `@[path/to/file]`). */
export const FILE_BRACKET_REGEX = /^@\[([^\]]+)\]/;

/** Extracts a quoted file path argument (e.g. `"path/to/file"`). */
export const FILE_QUOTE_REGEX = /^["']([^"']+)["']/;

/** Extracts an unquoted file path argument prefixed with `@` (e.g. `@path/to/file`). */
export const FILE_AT_REGEX = /^@(\S+)/;

/** Matches an exact bracketed file path for script resolution (e.g. `@[path]`). */
export const RESOLVER_BRACKET_REGEX = /^@\[([^\]]+)\]$/;

/** Matches an exact quoted file path for script resolution (e.g. `"path"`). */
export const RESOLVER_QUOTE_REGEX = /^["']([^"']+)["']$/;

// -----------------------------------------------------------------------------
// Lifecycle, Hooks & Transcripts
// -----------------------------------------------------------------------------

/** Detects cancellation, abort, or interrupt in termination reasons. */
export const TERMINATION_CANCEL_REGEX = /cancel|abort|interrupt/i;

/** Extracts the user prompt wrapped in Antigravity `<USER_REQUEST>` tags. */
export const USER_REQUEST_TAG_REGEX =
	/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i;

/** Strips leading UTF-8 Byte Order Mark (BOM) from stdin input. */
export const UTF8_BOM_REGEX = /^\uFEFF/;

// -----------------------------------------------------------------------------
// Text Utilities
// -----------------------------------------------------------------------------

/** Splits text lines across Unix (`\n`) and Windows (`\r\n`) line endings. */
export const LINE_SPLIT_REGEX = /\r?\n/;

/** Splits a string by one or more whitespace characters. */
export const WHITESPACE_SPLIT_REGEX = /\s+/;

/** Strips trailing directory separators (`/` or `\`). */
export const TRAILING_SLASHES_REGEX = /[/\\]+$/;
