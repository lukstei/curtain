- Prefer snapshot testing instead of a list of assertions
- Always place runner state transitions and status mutations in `src/transitions.ts`
- Run `npm run verify` when completing a task (not after every intermediate edit)
- Never add any backwards compatibility regarding the code, there is no external consumer of the code
- Reference implementations for cross-agent integrations:
  - Universal packaging & shims: `ponytail` (`~/.gemini/config/plugins/ponytail/`, analyzed in `docs/PACKAGING.md`)
  - Loop interception (`Stop` hook): `ralph-loop` (`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/ralph-loop/`)
  - Skill discovery: `superpowers` (`~/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.0/`)

## Source File Map (`src/`)

### Root (`src/`)
- `cli.ts`: Entry point for the CLI, parsing subcommands and flags.
- `parser.ts`: Pure string parser splitting Markdown scripts by curtain delimiters (`## <curtain>`, `## <curtain:gate>`, `## <curtain:auto>`).
- `transitions.ts`: Pure state transition functions and status mutations for runner lifecycle.
- `state.ts`: Reads, writes, and paths `curtain-state.json` on disk keyed by conversation ID.
- `resolver.ts`: Locates and loads script files across workspace paths.
- `types.ts`: TypeScript interfaces for hook payloads, egress responses, and messages.
- `test-utils.ts`: Test utilities for path stripping and snapshot normalization across environments.

### Subsystems
- `handlers/index.ts`: Deterministic hook dispatcher routing lifecycle events to pre or stop handlers.
- `handlers/pre.ts`: Handles PreInvocation lifecycle hook, intercepting slash commands and user prompts.
- `handlers/stop.ts`: Handles Stop lifecycle hook, auto-advancing, pausing at review curtains, and completing runs.
- `harnesses/`: Adapters for agent environments (AGY, Claude Code, Codex, Copilot) normalizing ingress/egress.
- `lib/getLatestMessage.ts`: Extracts the latest message from conversation transcript files across harnesses.
- `lib/logDebug.ts`: File-based debug logger active when debug flags are set.
- `lib/parseCommand.ts`: Extracts and parses runner slash commands from text inputs.
- `shim/runtime-shim.ts`: Entry point for agent hook execution, detecting the harness and dispatching to handlers.
- `shim/stdin.ts`: Reads and parses JSON payloads from standard input with timeout handling.
