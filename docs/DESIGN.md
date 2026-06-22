# Design (claude-local-issue)

> English | [日本語](./DESIGN-ja.md)

## Domain

Targets the `docs/issue/` of kawaz's repos. Not strict GitHub-flow issue management, but the "one notch looser" operation defined by the docs-structure skill (own-repo TODOs + cross-project request intake + cross-session memos).

One issue = one file (`docs/issue/YYYY-MM-DD-<slug>.md`), with these axes:

- **status** (transitions): `idea` / `open` / `wip` / `blocked` / `pending-sublimation`. Changes by intent, so passed explicitly as an update argument.
- **category** (classification): `idea` / `bug` / `request` / `design` / `task` / `tech-memo`. Derivable from the body, so the sub-command classifies it at write/update time.
- **temporal meta** (recorded by sub-commands): `created` / `last_read` / `*-entered` / `*-reason` / `blocked_by`, all full ISO8601 + TZ. **mtime is never used** (vcs operations make it unreliable, and reads don't change it, which would cause "nagged while actually reading").
- **body**

### Basis for the category enum

Confirmed by classifying ~68 issues mined from the current state + git history of 7 kawaz repos. `bug` / `request` (=feature) were the most frequent; `design` (design deliberation) appeared 12 times and was missing from the initial candidates, so it was added. `meta` (rule/infra improvement) was considered but dropped, since it is already separated by destination repo (claude-rules-* etc.).

## Architecture

### Why sub-commands (not hooks)

Isolating the multi-step work (filing, index update, commit) into a sub-command removes it from the originating context. The caller just passes repo / slug / body and calls once; context cost is about a single Write. Why the after-the-fact hook approach is not used: see DR-0001 Alternatives Considered.

Side benefits: low cost (`model: haiku`); convention isolation (index/naming/ja-en/commit all inside the sub-command); structurally fixed scope (single-issue input prevents whole-index scans or touching other issues).

### Why context: fork

Switching `model` without `context: fork` carries the parent session's context into the target model and can fail on window overflow (worst case: the main session becomes unrecoverable) — see claude-plugin-reference skills.md §9.1. fork gives a fresh context to avoid this.

### Path-scoped commit, no push

Uses `bump-semver vcs commit -m ... <file> <INDEX.md>`: commits only the listed paths' working-tree content, never grabbing other dirty changes, idempotent (no-op on no change). `-a/--all` is rejected by bump-semver's design. Push is out of scope (for cross-project filing, a local commit in the target repo is enough; delivery is a separate layer).

## Hooks

- **PreToolUse** (matcher: Read/Write/Edit, no `if`): fires on every Read/Write/Edit; the script inspects the stdin path and nudges only for issues under `docs/issue/`. Non-blocking (exit 0 + additionalContext).
  - **Why no `if`**: `if` is just a perf pre-filter, and its relative globs resolve against the project dir, so it would **miss cross-project filing (absolute paths / other repos)**. Path-based branching in the script is more reliable; extra firings exit 0 immediately for unrelated paths.
  - No exit-2 block because the sub-commands themselves use Read/Write/Edit; the script excludes INDEX.md / README.
- **SessionStart** (matcher `*`): nudges list when issues pile up or go stale; silent otherwise.
  - **Branches on source**: nudges only on `startup` / `clear` / `compact` (context is empty or just-compacted, so re-injection is worth it). `resume` is excluded (context survives, and it fires often via Ctrl-Z+fg etc., so nudging would be noise). Whether matcher alternation works on source values is unverified, so matcher is `*` and the script decides on source.

Thresholds are tunable via env (`CLAUDE_LOCAL_ISSUE_STALE_DAYS` / `CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD`); defaults 14 days / 5 items.

## Open (to settle through use)

- Exact day count for stale -> unread reset
- Item-count threshold for the SessionStart nudge
- The repo-name -> local-path resolution convention (`~/.local/share/repos/...`)
