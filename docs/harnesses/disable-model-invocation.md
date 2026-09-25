source: https://gist.github.com/zeke/0f654737ec01b20e9bf85d3cc0bc1c14

# `disable-model-invocation`: which coding agents support it?

Claude Code's Agent Skills format has an optional frontmatter field:

> `disable-model-invocation` — Set to `true` to prevent Claude from automatically loading this skill. Use for workflows you want to trigger manually with `/name`. Also prevents the skill from being preloaded into subagents. As of v2.1.196, also prevents the skill from running when a scheduled task fires with the skill as its prompt. Default: `false`.

I went looking for which other agents support this (or something equivalent). The [agentskills.io](https://agentskills.io) open spec itself does **not** define this field — only `name`, `description`, and optionally `license`, `compatibility`, `metadata`, `allowed-tools`. So this is an extension various clients have converged on (or diverged around).

## Supports the identical frontmatter field `disable-model-invocation`

| Agent | Notes |
|---|---|
| **Claude Code** | Origin of the field. Also blocks subagent preloading, and (v2.1.196+) blocks scheduled-task triggers. |
| **Cursor** | Same name/semantics. `true` → only reachable via `/skill-name`. Their rules→skills migration auto-sets this for legacy slash commands. |
| **VS Code (Copilot)** | Same name. Paired with `user-invocable` (default `true`), giving a 2×2 matrix: default, background-only, on-demand-only, or fully disabled. |
| **Factory (Droid CLI)** | Same name/semantics, also has the companion `user-invocable` field, same as VS Code. |
| **pi** | Implements it faithfully — see deep dive below. |

## Same idea, different mechanism (not a SKILL.md frontmatter field)

| Agent | Mechanism |
|---|---|
| **OpenAI Codex** | SKILL.md only supports `name`/`description`. Manual-only invocation is instead set in a sidecar `agents/openai.yaml` file: `policy.allow_implicit_invocation: false`. Explicit `$skill` invocation still works; implicit matching is disabled. |
| **OpenCode** | No per-skill frontmatter equivalent (frontmatter only recognizes `name`, `description`, `license`, `compatibility`, `metadata`). Instead, access is controlled globally via `opencode.json` permissions: `permission.skill.<name>: "deny"` or `"ask"`. This restricts *access* rather than offering a "model can't invoke it but user can" mode.

## No equivalent found

- **Amp** — frontmatter docs only mention `name`/`description`.
- **Roo Code** — only `name`/`description` required/recognized; adds mode-specific skill directories instead.
- **Gemini CLI** — discovery/activation flow (via an `activate_skill` tool + user consent), but no documented field for suppressing automatic invocation.

## Deep dive: how pi implements it

Looked at the actual source (`@earendil-works/pi-coding-agent` + underlying `pi-agent-core` harness).

**Parsing** (`core/skills.js`):

```js
disableModelInvocation: frontmatter["disable-model-invocation"] === true
```

Strict boolean check — only literal `true` counts; anything else (missing, `false`, or a stray string `"true"`) leaves the skill enabled. No warning on misuse.

**What it suppresses:** only the `<available_skills>` block injected into the system prompt. Implemented as a simple filter, present in *both* the CLI package and the underlying harness:

```js
export function formatSkillsForPrompt(skills) {
    const visibleSkills = skills.filter((s) => !s.disableModelInvocation);
    ...
```

**What it does NOT suppress:** the skill is still fully registered as a `/skill:name` command. The command list building code maps over *all* loaded skills with no `disableModelInvocation` check:

```js
const skills = this._resourceLoader.getSkills().skills.map((skill) => ({
    name: `skill:${skill.name}`,
    description: skill.description,
    source: "skill",
    ...
```

And `_expandSkillCommand` (which inlines the skill body when you type `/skill:name`) also ignores the flag — it always works.

**Things Claude's docs mention that don't apply to pi:**
- **Subagents** — pi has no subagent concept in the codebase at all, so there's nothing extra to suppress there.
- **Scheduled tasks** — pi has no scheduled-task feature, so the v2.1.196 Claude behavior has no analog.

**Comparison table:**

| Behavior | Claude Code | pi |
|---|---|---|
| Hides from auto-load / system prompt | ✅ | ✅ |
| Still invocable via `/name` | ✅ | ✅ (`/skill:name`) |
| Prevented from preloading into subagents | ✅ | N/A (no subagents) |
| Prevented from firing via scheduled task | ✅ (v2.1.196+) | N/A (no scheduled tasks) |
| Value validated / warned on misuse | not documented | no, silently coerced via `=== true` |
| Can disable manual invocation globally | n/a (per-skill) | yes, but only globally via `enableSkillCommands`, not per-skill |

So pi implements the core semantics faithfully — hide from auto-discovery, keep manual slash access — without the subagent/scheduled-task extensions Claude Code later added, simply because pi's architecture doesn't have those features (yet).
