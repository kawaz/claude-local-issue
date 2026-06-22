# claude-local-issue

> English | [日本語](./README-ja.md)

A Claude Code plugin that runs your local `docs/issue/` tracker as a set of **low-cost-model sub-commands (write / list / read / update / migrate)**, keeping issue CRUD, index maintenance, and VCS commits **out of the main session context**.

## What it solves

`docs/issue/` conventions already define a status model (`idea / open / wip / blocked / pending-sublimation / resolved / discarded`) and an archive-on-close flow, but nothing **drives the transitions**, so:

- Closed issues linger in the active directory, and every session re-checks "what's done already".
- Filing, index updates, and commits are done by hand in the originating session, eating context and drifting in how they're done.
- Issues get read and then left untouched.

This plugin isolates each operation into a **low-cost-model sub-command** (`model: haiku`/`sonnet` + `context: fork`). The originating session just passes a repo / slug / body and calls one sub-command; the context cost stays at roughly a single Write.

## Quick Start

```bash
# 1. install
/plugin marketplace add kawaz/claude-local-issue
/plugin install local-issue@local-issue
/reload-plugins

# 2. see active issues in the current repo (read-only, sorted by staleness)
/local-issue:list

# 3. file your first issue
/local-issue:write my-first-idea "Body text describing the idea..."

# 4. existing docs/issue/ directory with legacy format? normalize first
/local-issue:migrate --dry-run    # preview changes
/local-issue:migrate              # apply
```

Requires: `bump-semver` on `PATH` (path-scoped vcs commit driver), `python3` (used by hooks for JSON escape), `bash`, `git` or `jj`. macOS / Linux.

## Sub-commands

| Sub-command | Role |
|---|---|
| `write` | File one issue. Classify category, generate the file from `templates/issue.md`, reflect this one entry into the INDEX, `bump-semver vcs commit` (no push). Cross-project filing (target repo ≠ current project) supported. |
| `list` | List/aggregate active issues by status / category / staleness, read-only. Filters: `--status` / `--category` / `--stale-days` / `--unread-only` / `--include-archive` / `--repo`. |
| `read` | Read one issue, record `last_read` (full ISO8601 + TZ), and push a "decide a direction, then update" TODO onto the caller. Direct `archive/` reads skip the `last_read` update and commit. |
| `update` | Transition status, edit body, or **close** (= move to `archive/`, normalize `close_reason` to `string[]`, auto-file follow-up issues for unimplemented DRs). Files are preserved in `archive/` as a history DB, never deleted. |
| `migrate` | Bulk-normalize all issues in `docs/issue/`: backfill missing frontmatter, classify categories from body, absorb legacy body lines (`- Status:` / `- Date:` / `- 発見元:` etc.), strip `no-historical-noise` comments, regenerate `INDEX.md` from `templates/index.md`. `--dry-run` for preview. |

All operations are scoped to a single issue (except `migrate`, the only bulk operation). They never touch other issues or the whole index (firing scope = work scope).

## Categories (enum)

`idea` / `bug` / `request` / `design` / `task` / `tech-memo` — classified from the body at `write` / `update` time (normalize once on write, never re-derive in `list`).

## Hooks

| Hook | Role |
|---|---|
| `PreToolUse` (`Read` / `Write` / `Edit` / `Bash`) | Detect raw access — including shell-read commands (`cat` / `head` / `tail` / `grep` / `sed` / `less` / ...) — to `docs/issue/<file>.md` and nudge toward the sub-commands (non-blocking; `INDEX.md` / `README*` excluded). |
| `SessionStart` (`startup` / `clear` / `compact`; `resume` excluded) | Nudge `list` when active issues exceed a threshold or go stale (silent otherwise). |

## Design assumptions

- Sub-commands stop at **commit** — no push (delivery is a separate layer).
- Commits are **path-scoped** (`bump-semver vcs commit -m ... <paths>`; never `-a / git add .`).
- Index / naming / ja-en conventions live inside the sub-commands; the caller need not know them.
- Closed issues are **moved to `docs/issue/archive/`**, not deleted (= "history DB"). `list` excludes `archive/` by default (`--include-archive` to include).
- All single-issue commands touch **exactly one issue file + INDEX**; never the whole index or other issues (firing scope = work scope).

See [SKILL.md](./SKILL.md) (the AI-facing full guide, opened by `/local-issue:local-issue`), [docs/DESIGN.md](./docs/DESIGN.md) (architecture), and [docs/decisions/](./docs/decisions/) (design history).

## License

MIT License, Yoshiaki Kawazu (@kawaz)
