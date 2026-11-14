# Design (claude-local-issue)

> English | [日本語](./DESIGN-ja.md)

The decision record is [DR-0006](./decisions/DR-0006-direct-edit-with-mod-normalization.md). This document describes the plugin as it is.

## Purpose

Keep the `docs/issue/` INDEX and status handling uniform across kawaz's repositories. Forbidding direct edits to issue files is not part of the purpose.

What it must not add:

- Prose procedures executed by an LLM (routes that make a model carry out work that can be deterministic)
- Places that hold an issue's state. Only each file's frontmatter does; INDEX is derived from it
- Commits made by the plugin. The working session decides when to commit
- Text that sits in the context all the time (tool descriptions, skill listings)

## Domain

One issue is one file (`docs/issue/YYYY-MM-DD-<slug>.md`). The practice is looser than a GitHub-flow tracker: the repository's own TODOs, requests from other projects, and notes that carry a discussion across sessions.

- **status**: `idea` / `open` / `wip` / `blocked` / `resolved` / `discarded`. `blocked` carries a reason (`blocked_by`); `resolved` / `discarded` carry a classification (`close_reason`) and an optional reference (`close_ref`)
- **category**: `idea` / `bug` / `request` / `design` / `task` / `tech-memo`. The writer decides it; the plugin only checks it is one of these
- **created**: the filing date, the only measure of staleness. When a status changed is not recorded
- **origin**: the project that asked for it (when filed from another project)
- **body**: everything after the frontmatter. Agents grow it freely; the plugin never changes a byte of it

Closed issues stay in `docs/issue/archive/` under the same name as a record.

## Architecture

### Layout

The plugin holds one Claude Mods hooks module (`hooks/register.ts`) and nothing else: no command, classic hook, skill, template or tool. Agents handle issue files directly with Read / Write / Edit / Bash, and the module brings them into shape afterwards.

- `hooks/issue.ts`: the decisions. Frontmatter normalization, the INDEX text, the listing diff, which calls add a place and when a place is written, the wording of what is told. Pure functions with no `$`, tested directly with bun test (`test/`)
- `hooks/register.ts`: reading, writing and telling through `$`, tested by driving it through the engine's `$` with stand-ins such as an in-memory file system (`tests/`, `claude plugin test`)

The frontmatter is read by a small parser of `field: value` lines rather than a YAML or schema library. A hooks module can import only relative files and `claude-code`, so a library would need bundling, while the shape it reads is a flat list of lines with eight known fields. How it reads (quotes, comments, capitalised names, values over several lines, files left untouched) is in the README's "Frontmatter" section.

### Detection

- Watched places: `docs/issue/` of the session's working directory, plus any other `docs/issue/` named by a call that can write there (the `file_path` of Write / Edit, a Bash command). Read does not add a place. Places are kept by real path
- The working directory's `docs/issue/` is kept whole: `session.start` normalizes every file in it once, and any change there (an `INDEX.md` edited by hand included) starts a pass
- Another repository's `docs/issue/` is the territory of sessions started in it. When a call names it, the directory is recorded as it stands before `next(e)`, writing nothing, and it is recorded again before every later tool call. After the tool runs, only the files that differ from that record (changed or removed) are normalized and closed, and its INDEX is regenerated only then. Reading it, or naming it without changing a file, writes not one byte there. A place that did not exist before the call starts empty, so what the tool created there counts as changed
- In `tool.call`, after `next(e)`, each place is listed again (name, size, mtime); only the entries that moved are read and their hashes compared. Only files whose content changed are normalized, and the INDEX of each place that needs a pass is regenerated. Tools of the main session and of subagents alike
- The repair finishes synchronously before the tool's result is returned. Repairing after the result goes back makes the engine fail a later Write as "modified since read"; repairing before lets the engine notice the change and update the agent's read state, so a following Edit does not fail
- Checks of tools that ran side by side run one at a time. A file is read again right before it is written back and right before a move to archive/, and if it changed since it was judged the work is redone on the new content
- A file that cannot be read or written is pointed out, and the other files and the INDEX are still processed

### How things are told

| What | Where | Why |
|---|---|---|
| Fixes (field names only, the destination of a move to archive), and `INDEX.md を更新した` once per place | the `context` of the triggering tool's result | the agent reads it right after that tool; a fix needs no decision from the agent, so one line is enough. The INDEX line keeps a session that commits by path from leaving INDEX out |
| Points to fix (file, what is wrong, what to do) | `$.session.append` into the conversation of the agent that ran the tool (a subagent by its `agentId`, the main session when the subagent cannot be reached) | these are for the agent to fix; they reach the agent that wrote the file or they are not fixed |
| Startup summary | the `context` of the first prompt | the startup pass belongs to no tool call; it rides on the first request, once. When a hook above drops that prompt, it waits for the next one |

- Files are named `docs/issue/<file>` in the working directory and by absolute path elsewhere. Values and names taken from a file are quoted and cut at 40 characters, so a file's content is not read as an instruction
- The same point for the same file is not repeated until the file's content (hash) changes. A point that reached no conversation, and a point left out of the startup summary's list (5 files in all), do not count as told and are sent again later

### Close and archive

A file whose `status` is `resolved` or `discarded` and that has nothing pointed out is moved to `archive/`. It is read again right before the move and moved only if it is still what was judged. `$.fs` can write but not rename or delete, so the move runs `mkdir -p` and `mv -n` through `$.process.run`, and whether it moved is read back from the file system. A move that fails is pointed out with what is known of the cause (the error of `mv`). When `archive/` already has the name, the file is not moved and that is pointed out.

To reopen an issue, change its `status` inside `archive/` first, then move it back to `docs/issue/`. Moved back with a closing status, it goes straight to `archive/` again at the next check.

### INDEX.md

Generated in full from the frontmatter of every active file each time, and written only when its text changes. Files with points still to fix are listed too, with invalid values shown as written (a line break inside a cell becomes a space). Order: status (`idea` → `open` → `wip` → `blocked`, then `resolved` / `discarded` kept by a point, then any other value), newest date first, then slug.

## Consequences

- The added cost of an issue operation is the re-listing and the re-reading of changed files (tens of milliseconds) plus one line when something was fixed
- What sessions without the plugin or other tools wrote is brought into shape only when a session with the plugin next starts in that repository; those changes appear uncommitted in that session's working copy
- The startup pass covers every active file of the repository. In a repository whose issues were written in another frontmatter format, the first startup rewrites every file and the INDEX; fields outside the table are removed even with a value (the values stay in the VCS diff)
- Closing changes the file's path
- When a status changed is not recorded; staleness is measured from the filing date only
- There is no check to run before a push (no CLI outside Claude)

## Limits

- **Concurrent writes**: if another writer changes a file between the module's re-read and its write, that change is overwritten. The module's API has neither a lock nor an atomic replace
- **Places read from Bash commands**: `docs/issue/` is found in the command text only, relative to the session's working directory. A `cd`, variables and paths with spaces are not followed; a write into another repository missed this way is brought into shape by the next session started there. Absolute paths of Write / Edit are always caught
- **Rewrites that keep both size and mtime**: not detected
- **Tools running side by side**: the check runs after the tool that finished first, so fixes and points can reach the agent of that tool rather than the one that wrote the file
- **After `/clear` and compaction**: points already told are not told again until the file changes. `/clear` and an in-session `/resume` do not raise `session.start`, so the startup summary is not repeated and the watched places carry on

## Threshold

The threshold of the startup count defaults to 5 and can be changed with the environment variable `CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD`. DR-0004 is reserved for revisiting the default from use.
