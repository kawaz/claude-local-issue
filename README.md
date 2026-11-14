# claude-local-issue

> English | [日本語](./README-ja.md)

A Claude Code plugin that keeps a repository's `docs/issue/` tracker in shape while agents read and write the issue files directly. It is a single Claude Mods hooks module: after every tool call (the main session's and every subagent's) it looks at `docs/issue/`, normalizes the frontmatter of the files that changed, regenerates `INDEX.md`, and moves closed issues to `docs/issue/archive/`.

It adds no command, skill or tool to the session, never rewrites the body of an issue, and never commits: the session that is working decides when to commit.

## Install

```bash
/plugin marketplace add kawaz/claude-local-issue
/plugin install local-issue@local-issue
/reload-plugins
```

Requires Claude Code 2.1.325 or later. The plugin acts only in repositories that already have a `docs/issue/` directory (it never creates one).

## How it works

Write issues with the usual tools (Write / Edit / Bash). For example, a new file with only a heading:

```markdown
# Login fails on Safari

Steps to reproduce: ...
```

right after the Write, the plugin has turned it into:

```markdown
---
title: Login fails on Safari
status: open
created: 2026-11-14
---
# Login fails on Safari

Steps to reproduce: ...
```

and the agent is told, as lines on that tool's result:

```
local-issue: docs/issue/2026-11-14-login-fails.md: frontmatter を足した、title を補った、status を補った、created を補った
local-issue: docs/issue: INDEX.md を更新した
```

What the plugin cannot decide by itself (here, `category`) is pointed out to the agent whose tool wrote the file, with what to do, and the agent fixes it.

## Files

| Path | Holds |
|---|---|
| `docs/issue/YYYY-MM-DD-<slug>.md` | an active issue (`<slug>` is `[a-z0-9][a-z0-9-]*`, the date is a calendar date) |
| `docs/issue/archive/` | closed issues, under the same file name |
| `docs/issue/INDEX.md` | generated from the frontmatter of the active issues; do not edit by hand |

`INDEX.md` and files whose name starts with `README` (in any case) are not issues. Nothing inside `archive/` is read or rewritten.

## Frontmatter

The fields, in this order. Any other field is removed, and an optional field with an empty value is not written.

| Field | Required | Value | When missing or invalid |
|---|---|---|---|
| `title` | yes | one line | taken from the first `# ` heading of the body (outside code fences); pointed out when there is none |
| `status` | yes | `idea` / `open` / `wip` / `blocked` / `resolved` / `discarded` | missing becomes `open`; case and surrounding spaces are fixed; `pending-sublimation` is a value read as `open`; anything else is pointed out |
| `category` | yes | `idea` / `bug` / `request` / `design` / `task` / `tech-memo` | pointed out (no default); case and surrounding spaces are fixed |
| `created` | yes | ISO 8601 date or date-time, on the calendar | filled from the date in the file name |
| `origin` | no | the project that asked for it | kept as written |
| `blocked_by` | while `status: blocked` | up to 30 characters; a ruling awaited in `docs/QUESTIONS.md` starts with its label | pointed out when missing or longer; removed under any other status |
| `close_reason` | while `resolved` / `discarded` | `implemented` / `documented` / `discarded` / `duplicate` | pointed out when missing or invalid; removed under any other status |
| `close_ref` | no | up to 30 characters: the reference behind the close (a DR number, a version, a finding's slug) | pointed out when longer; removed under a non-closing status |

How the frontmatter is read:

- One `field: value` per line. Quotes around a value are removed, and outside quotes ` #` starts a comment (`status: open # memo` is `open`). Comment-only lines and blank lines are dropped when the frontmatter is written back
- Field names are read in lower case (`Title:` is written back as `title:`); when two lines become the same field, the first one is kept. `field:value` without a space counts only for the eight field names above, so a line such as a URL is not taken for a field
- A value that spans several lines is kept whole and pointed out, whatever the field
- While `status` is invalid, `blocked_by` / `close_reason` / `close_ref` are kept, so that no reason is lost on the way to fixing the status
- A leading BOM is kept, and the frontmatter is read after it

These files are pointed out and left untouched, byte for byte, until they are fixed: a frontmatter without its closing `---` line, a frontmatter containing conflict marks (lines starting with `<<<<<<<` `=======` `>>>>>>>` `%%%%%%%` `+++++++` `-------`), and a frontmatter with blank or other lines before its first `---`.

Every value the plugin fills in comes from the file itself (its name, its heading), never from the clock, so the same file gives the same result whoever runs it. A file whose name does not have the `YYYY-MM-DD-<slug>.md` form is pointed out; the plugin never renames files.

## Closing and reopening an issue

Set `status` to `resolved` or `discarded` and give a `close_reason`. Once nothing is pointed out for the file, the plugin moves it to `docs/issue/archive/` and tells the agent the new path. The file is read again right before the move and moved only if it is still what was judged. While something is pointed out the file stays where it is, and when `archive/` already has a file of the same name the move is not made and that is pointed out.

To reopen a closed issue, change its `status` inside `archive/` first, then move it back to `docs/issue/`. Moved back with a closing status, it would go straight to `archive/` again at the next check.

## INDEX.md

Regenerated from all active issues whenever something in `docs/issue/` changes, and written only when its text changes. Columns: `| date | category | status | issue | blocked_by |`, where `date` is the date in the file name and `issue` links the title (cut at 60 characters with `…`). Rows are ordered by status (`idea` → `open` → `wip` → `blocked`, then files kept active by something pointed out), then newest date first, then slug.

## What the agent is told

Files are named `docs/issue/<file>` in the working directory and by absolute path elsewhere. Values and names taken from a file are quoted and cut at 40 characters, so a file's content is not read as an instruction.

- **Fixes**: one line per file on the result of the tool call that triggered them, naming only the fields (`local-issue: docs/issue/<file>: status を直した、foo を消した`), or the new path after a move to `archive/`. When `INDEX.md` was rewritten, `INDEX.md を更新した` is added once per place, so a session that commits by path does not leave it out
- **Points to fix**: appended to the conversation of the agent that ran the tool (a subagent gets its own; when it cannot be reached, the main session gets it), one line per file with what is wrong and what to do. The same point for the same file is not repeated until the file changes; a point that reached no conversation is sent again at the next check
- **At startup**: see below
- A file that cannot be read or written is pointed out, and the other files and `INDEX.md` are still processed

## At startup

When a session starts in a repository with `docs/issue/`, the plugin normalizes every active issue there once and adds one summary to the first prompt: what it fixed, what is left to fix, whether `INDEX.md` was rewritten, and, when the number of active issues reaches the threshold, that number and the three oldest. At most 5 files are named in all (points to fix first); the rest are counted, and points not named are told again later.

This catches up on files written by sessions without the plugin or by other tools. In a repository whose issues were written in another frontmatter format, the first startup rewrites every active file and `INDEX.md`; fields outside the table above are removed even when they have a value (the values stay in the VCS diff). The changes are left uncommitted in the working copy.

## Other repositories

Another repository's `docs/issue/` is watched once a call that can write there names a path in it (the `file_path` of Write / Edit, or a path in a Bash command). There the plugin only handles what this session's tools change: before each tool runs it records the directory as it stands, and afterwards it normalizes (and closes) only the files that differ from that record and regenerates that repository's `INDEX.md` only when one did. Reading another repository's issue, or naming it without changing anything, writes nothing there; bringing that repository's whole `docs/issue/` into shape is the job of a session started in it.

## Limits

- **Concurrent writes**: if another writer changes a file between the plugin's last read and its write, that change is overwritten. The hooks API has no lock and no atomic replace
- **Paths in Bash commands**: `docs/issue/` is found in the command text only, relative to the session's working directory. A `cd` inside the command, variables and paths with spaces are not followed; a write into another repository missed this way is brought into shape by the next session started there. Absolute paths of Write / Edit are always caught
- **Rewrites that keep both size and mtime** are not detected
- **Tools running side by side**: the check runs after the tool that finished first, so fixes and points can reach the agent of that tool rather than the one that wrote the file
- **After `/clear` and compaction**: points already told are not told again until the file changes

## Configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD` | `5` | number of active issues from which the startup summary reports the count and the oldest three |

## Development

```bash
bun install      # TypeScript, oxlint and bun's types for the checks
just ci          # validate, type check, lint, tests, translation freshness
```

`test/` holds the unit tests of the pure decisions (`bun test`); `tests/` drives the hooks module through the engine with an in-memory file system (`claude plugin test`). The type definitions of the hooks module (`.claude-plugin/types/`) are written by Claude Code when it loads the plugin from this folder in an interactive session (`claude --plugin-dir .`), or with `/plugin-types .`.

## License

MIT
