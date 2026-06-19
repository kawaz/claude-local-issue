# claude-local-issue

> English | [日本語](./README-ja.md)

A Claude Code plugin that runs your local `docs/issue/` tracker as a set of **low-cost-model skills (write / list / read / update)**, keeping issue CRUD, index maintenance, and VCS commits **out of the main session context**.

## What it solves

`docs/issue/` conventions already define a status model (`idea/open/wip/blocked/pending-sublimation`) and a delete-on-resolve flow, but nothing **drives the transitions**, so:

- Resolved issues linger, and every session re-checks "what's done already".
- Filing, index updates, and commits are done by hand in the originating session, eating context and drifting in how they're done.
- Issues get read and then left untouched.

This plugin isolates each operation into a **low-cost-model skill** (`model: haiku` + `context: fork`). The originating session just passes a repo / slug / body and calls one skill; the context cost stays at roughly a single Write.

## Skills

| Skill | Role |
|---|---|
| `write` | File an issue. Classify category, generate the file, reflect this one entry into the index, `bump-semver vcs commit` (no push). Cross-project filing supported. |
| `list` | List/aggregate by status / category / staleness (read-only). |
| `read` | Read one issue, record Last-Read, and force the caller to TODO-ify "decide a direction, then update". |
| `update` | Change status / edit body / resolve (stash to record target, delete, drop from index). |

All single-issue scoped. They never touch other issues or the whole index (firing scope = work scope).

## Categories (enum)

`idea` / `bug` / `request` / `design` / `task` / `tech-memo`, classified from the body at write/update time (normalize once on write, never re-derive in list).

## Hooks

| Hook | Role |
|---|---|
| `PreToolUse` (Read/Write/Edit on `**/docs/issue/*.md`) | Detect raw access and nudge toward the skills (non-blocking; INDEX.md excluded). |
| `SessionStart` (startup/resume) | Nudge `list` when issues pile up or go stale (silent otherwise). |

## Design assumptions

- Skills stop at **commit** — no push (delivery is a separate layer).
- Commits are **path-scoped** `bump-semver vcs commit -m ... <paths>` (no grabbing other dirty changes; idempotent).
- Index/naming/ja-en conventions live inside the skills; the caller need not know them.

See [docs/DESIGN.md](./docs/DESIGN.md) for details.

## License

MIT License, Yoshiaki Kawazu (@kawaz)
