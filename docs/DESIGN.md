# Design (claude-local-issue)

> English | [日本語](./DESIGN-ja.md)

## Domain

This plugin is an **evolution** of the `docs/issue/` operation that `claude-rules-personal`'s `docs-knowledge-flow` / `docs-structure` defines. It evolves the original "delete-on-resolve flow with 5-value status" into an "archive + DB model with 7-value status" (see DR-0002). The evolution completes when the rules side is rewritten to assume this plugin (see `rules-revision-after-plugin` issue).

The target is `docs/issue/` across kawaz's repos. Not strict GitHub-flow issue management — instead, the "one notch looser" operation that `docs-structure` rule defines (own-repo TODOs + cross-project request intake + cross-session memos).

One issue = one file (`docs/issue/YYYY-MM-DD-<slug>.md`), with these axes:

- **status** (transitions): `idea` / `open` / `wip` / `blocked` / `pending-sublimation` / `discarded` (rejected: assumption gone or direction changed) / `resolved`. Changes by intent, so passed explicitly as an `update` argument.
- **category** (classification): `idea` / `bug` / `request` / `design` / `task` / `tech-memo`. Derivable from the body, so the sub-command classifies it at write/update time.
- **temporal meta** (recorded by sub-commands): `created` / `last_read` / each `*_entered` (timestamp of each `open` / `wip` / `blocked` / `pending` / `discarded` / `resolved` entry) / `*_reason` (reason for discard / pending) / `blocked_by`. All **full ISO8601 + TZ** (`date -Iseconds`). **mtime is never used** (vcs operations make it unreliable; reads don't change it either, which would cause "nagged while actively reading").
- **body**

### Basis for the category enum

Confirmed by classifying ~68 issues mined from the current state + git history of 7 kawaz repos. `bug` / `request` (= feature) were the most frequent; `design` (design deliberation) appeared 12 times and was missing from the initial candidates, so it was added. `meta` (rule / infra improvement) was considered but dropped, since it is already separated by destination repo (`claude-rules-*` etc.).

## Architecture

### Why sub-commands (not hooks)

Isolating the multi-step work (filing, index update, commit) into a sub-command removes it from the originating context. The caller just passes repo / slug / body and calls once; the context cost is about a single Write. Why the after-the-fact hook approach is not used: see DR-0001 Alternatives Considered.

Side benefits:

- **Low cost**: it's routine work, so `model: haiku`. Even if the originating session is on the top-cost tier, just the filing falls onto a cheaper model.
- **Convention isolation**: index / naming / ja-en / commit conventions all live inside the sub-command. The caller doesn't need to know them.
- **Structural scope fixing**: the sub-command's input is one issue, so whole-index scans or other-issue spillover cannot happen.

### Placement and naming (= DR-0003)

All sub-commands (list / read / write / update / migrate) are **placed in `commands/<name>.md` with general-word naming**, unified. Claude Code's `commands/` and `skills/` placements are the same mechanism at runtime; this plugin chooses `commands/` for the audit clarity. Completion-time namespace collisions are absorbed by fuzzy match, and runtime resolution is unambiguous via `/<plugin>:<name>`. **Agents are not adopted**: an agent is an independent worker with its own system prompt, which is overkill for routine-flow-driven issue CRUD. Isolation and low-cost model are achieved by the sub-command's `model + context: fork + agent: general-purpose` (skills.md §9.2 recipe), so a separate `agents/*.md` file is unnecessary. See DR-0003 for the full rationale.

### Why context: fork

Switching `model` without `context: fork` carries the parent session's context into the target model, and the invocation can fail on window overflow (worst case: the main session becomes unrecoverable) — see claude-plugin-reference's skills.md §9.1. `fork` gives a fresh context to avoid this.

### Path-scoped commit, no push

Uses `bump-semver vcs commit -m ... <file> <INDEX.md>`. Commits only the listed paths' working-tree content, never grabbing other dirty changes, idempotent (no-op on no change). `-a / --all` is rejected by bump-semver's design. Push is out of scope for the filing sub-command (for cross-project filing, "the target repo has a local record" is enough; delivery is a separate layer).

## Hooks

- **PreToolUse** (matcher: `*`, no `if`): fires on every tool call; the script structurally parses stdin as JSON (via `jq`) and, if the target path is under `docs/issue/`, nudges toward the corresponding sub-command. Detects the Read / Write / Edit / Bash (= read/write-system commands like `cat` / `head` / `tail` / `grep` / `sed` etc.) routes. **Non-blocking** (`exit 0` + `additionalContext`).
  - **Why no `if`**: `if` is just a perf pre-filter, and its relative globs resolve against the project dir, so it would **miss cross-project filing (absolute paths / other repos)**. Path-based branching in the script is more reliable. Extra firings exit 0 immediately for unrelated paths, so no real harm.
  - No exit-2 block because the sub-commands themselves use Read / Write / Edit. The script excludes `INDEX.md` / `README*` / `archive/` from the nudge.
- **SessionStart** (matcher `*`, `issue-count-nudge.sh`): nudges `list` when active issues exceed a threshold. Silent otherwise.
  - **Counts only, no stale check**. Stale is unreliable from mtime and should be computed from frontmatter TS max — that computation belongs to `list`. The nudge is just "a reason to look", and `list` makes the qualitative call.
  - **Branches on source**: nudges only on `startup` / `clear` / `compact`. `resume` is excluded (context survives, and it fires often via Ctrl-Z+fg etc., so nudging would be noise). Whether matcher alternation works on the source value is unverified, so `matcher` is `*` and the script decides on the source.

Thresholds are tunable via env (`CLAUDE_LOCAL_ISSUE_STALE_DAYS` / `CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD`); defaults 14 days / 5 items.

## Close and archive

`close` is taken when "the thing the issue tried to do is actually done or rejected". **Closing after creating just a DR is fine** — but if `close_reason` (`string[]`) contains `dr/*` and no `implemented`, the close sub-command auto-files a follow-up issue "Finish implementing DR-XXXX" (task, same repo), one per DR. The old practice of "create a DR and let implementation slip" is prevented by inseparably linking close with follow-up filing.

Closed issues are **moved to `docs/issue/archive/`**, not deleted. Direct reads are guarded by the hook, and `list` excludes `archive/` by default, so from the main context the issue "disappears" (= same effect as deletion). The history (all TS / reason) survives as a DB. `archive` is the physical expression of visibility, orthogonal to `status`.

## Open (to settle through use)

- Exact day count for stale → unread reset (= `read-stale-days-threshold` issue, runtime observation pending)
- Item-count threshold for the SessionStart nudge (= `sessionstart-count-threshold` issue, runtime observation pending)
- Repo-name → local-path resolution convention `~/.local/share/repos/github.com/kawaz/<name>/main` is already settled in SKILL.md path conventions
