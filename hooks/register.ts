// local-issue: the agent reads and writes docs/issue/ files directly, and this
// module keeps them in shape (DR-0006). After every tool call (main and
// subagents alike) it looks at the docs/issue/ directories it watches, and for
// each file that changed it rewrites the frontmatter, moves a closed file to
// archive/, and regenerates INDEX.md. It never touches a body and never
// commits. What it fixed rides on the tool's result; what only the agent can
// fix is appended to the conversation of the agent whose tool caused it.
//
// The decisions (what a file should look like, what INDEX.md says, what
// changed, the wording) are plain functions in issue.ts; this file is the part
// that reads, writes and tells through `$`.

import type { EngineInterface, Register } from 'claude-code'
import {
  type IndexEntry,
  type Listed,
  type Snapshot,
  type Stamp,
  INDEX_NAME,
  dirLabel,
  fileLabel,
  fixLine,
  indexLine,
  issueDirsIn,
  movedPhrase,
  needsPass,
  normalizeIssue,
  parseThreshold,
  planScan,
  problemLine,
  quote,
  renderIndex,
  startupNotice,
  writeTexts,
} from './issue'

type $ = EngineInterface

/** What one file came to after a look: the fixes made, the problems left, keyed by its path and content. */
type FileReport = { label: string; path: string; hash: string; fixes: string[]; problems: string[] }

/** What one look at a directory came to. */
type DirReport = { label: string; files: FileReport[]; isIndexUpdated: boolean }

/** The docs/issue/ directories watched, by real path. */
const dirs = new Map<string, Snapshot>()
let cwdDir: string | undefined
let cwd = ''
/** The problems each file has been told, until its content (hash) changes. */
const told = new Map<string, { hash: string; texts: Set<string> }>()
/** Reports whose problems reached no conversation: sent again at the next check while the file is unchanged. */
const undelivered = new Map<string, FileReport>()
/** The startup summary waiting for the first prompt, and the files whose problems it names. */
let pendingNotice: { text: string; reports: FileReport[] } | undefined
/** Checks run one at a time, so tools that ran side by side are looked at in turn. */
let queue: Promise<unknown> = Promise.resolve()

/**
 * How many times a file is normalized again when it changed between the read
 * and the write: a file still changing after that is being written
 * continuously, and the next tool call's check picks it up.
 */
const REWRITE_TRIES = 3

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error'
}

async function realDir($: $, path: string): Promise<string | undefined> {
  try {
    const st = await $.fs.stat(path, { resolve: true })
    return st.kind === 'dir' ? (st.realPath ?? path) : undefined
  } catch {
    return undefined
  }
}

async function listDir($: $, dir: string): Promise<Listed[] | undefined> {
  try {
    const entries = await $.fs.list(dir)
    return entries.filter((x) => x.kind === 'file').map((x) => ({ name: x.name, size: x.size, mtimeMs: x.mtimeMs }))
  } catch {
    return undefined
  }
}

async function stampOf($: $, path: string): Promise<Stamp | undefined> {
  try {
    const st = await $.fs.stat(path)
    return { size: st.size, mtimeMs: st.mtimeMs }
  } catch {
    return undefined
  }
}

/** A file's text; undefined only when the file is not there. A file that is there but cannot be read throws. */
async function readIfThere($: $, path: string): Promise<string | undefined> {
  try {
    return await $.fs.read(path)
  } catch (err) {
    if (!(await $.fs.exists(path))) return undefined
    throw err
  }
}

/**
 * Moves a closed file into archive/ under the same name, and says why when it
 * could not.
 *
 * Design rationale: `$.fs` can write but not rename or delete, so the move is
 * `mkdir -p` and `mv -n` run through `$.process.run`; `-n` never replaces a
 * file already in archive/. Whether it moved is read back from the file
 * system rather than from the exit code.
 */
async function moveToArchive($: $, dir: string, name: string): Promise<string | undefined> {
  const from = `${dir}/${name}`
  const to = `${dir}/archive/${name}`
  try {
    const made = await $.process.run(['mkdir', '-p', `${dir}/archive`])
    if (made.exitCode !== 0) return `archive/ を作れなかった: ${made.stderr.trim()}`
    const moved = await $.process.run(['mv', '-n', from, to])
    if (!(await $.fs.exists(from)) && (await $.fs.exists(to))) return undefined
    return moved.stderr.trim() === '' ? 'mv の後も元の場所に残っている' : `mv: ${moved.stderr.trim()}`
  } catch (err) {
    return errorText(err)
  }
}

function moveProblem(reason: string): string {
  return `archive/ へ移せなかった (${quote(reason)})。archive/ に書き込めるかを確かめ、直らなければ手で archive/ へ移す`
}

/**
 * Brings one changed file to shape. The file is read again right before each
 * write and right before a move to archive/; when someone changed it since it
 * was judged, the work is redone on the newer text.
 */
async function settleFile($: $, dir: string, state: Snapshot, name: string, first: string): Promise<FileReport> {
  const path = `${dir}/${name}`
  const label = fileLabel(dir, name, dir === cwdDir)
  const fixes: string[] = []
  const addFixes = (more: readonly string[]): void => {
    for (const f of more) if (!fixes.includes(f)) fixes.push(f)
  }
  let text = first
  let outcome = normalizeIssue(name, text)
  for (let i = 0; i < REWRITE_TRIES; i++) {
    outcome = normalizeIssue(name, text)
    if (outcome.text !== text) {
      const now = await readIfThere($, path)
      if (now === undefined) break
      if (now !== text) {
        text = now
        continue
      }
      await $.fs.write(path, outcome.text)
      addFixes(outcome.fixes)
      text = outcome.text
    }
    if (!outcome.isClosed) break
    if (await $.fs.exists(`${dir}/archive/${name}`)) {
      outcome.problems.push(`archive/ に同じ名前のファイル ${quote(name)} があるので移さなかった。ファイル名を変えるか、archive/ の方を確かめる`)
      break
    }
    const now = await readIfThere($, path)
    if (now === undefined) break
    if (now !== text) {
      text = now
      continue
    }
    const failed = await moveToArchive($, dir, name)
    if (failed === undefined) {
      state.files.delete(name)
      addFixes([movedPhrase(dir === cwdDir ? `docs/issue/archive/${name}` : `${dir}/archive/${name}`, text)])
      return { label, path, hash: await sha256(text), fixes, problems: [] }
    }
    outcome.problems.push(moveProblem(failed))
    break
  }
  const hash = await sha256(text)
  const stamp = await stampOf($, path)
  if (stamp !== undefined) state.files.set(name, { ...stamp, hash, entry: outcome.entry })
  else state.files.delete(name)
  return { label, path, hash, fixes, problems: outcome.problems }
}

type Observed = { changed: { name: string; text: string; hash: string; stamp: Stamp }[]; removed: string[]; failed: FileReport[]; isIndexTouched: boolean; index: Stamp | undefined }

/**
 * Re-lists one watched directory and reads only the files whose size or
 * mtime moved. Returns the files whose content (hash) really changed since the
 * snapshot, the files gone from it, the files that could not be read, and
 * whether INDEX.md was touched; files whose stamp moved but whose content did
 * not are updated in place.
 */
async function observe($: $, dir: string, state: Snapshot): Promise<Observed | undefined> {
  const listing = await listDir($, dir)
  if (listing === undefined) {
    state.files.clear()
    state.index = undefined
    return undefined
  }
  const plan = planScan(state, listing)
  const listed = new Map(listing.map((f) => [f.name, f]))
  const changed: Observed['changed'] = []
  const failed: FileReport[] = []
  const removed = [...plan.removed]
  for (const name of plan.toRead) {
    const stamp = listed.get(name)
    let text: string | undefined
    try {
      text = await readIfThere($, `${dir}/${name}`)
    } catch (err) {
      failed.push(await failureReport(dir, name, err))
      continue
    }
    if (text === undefined || stamp === undefined) {
      if (state.files.delete(name)) removed.push(name)
      continue
    }
    const hash = await sha256(text)
    const known = state.files.get(name)
    if (known !== undefined && known.hash === hash) state.files.set(name, { ...known, size: stamp.size, mtimeMs: stamp.mtimeMs })
    else changed.push({ name, text, hash, stamp: { size: stamp.size, mtimeMs: stamp.mtimeMs } })
  }
  for (const name of plan.removed) state.files.delete(name)
  const index = listed.get(INDEX_NAME)
  return {
    changed,
    removed,
    failed,
    isIndexTouched: plan.isIndexTouched,
    index: index === undefined ? undefined : { size: index.size, mtimeMs: index.mtimeMs },
  }
}

async function failureReport(dir: string, name: string, err: unknown): Promise<FileReport> {
  const reason = errorText(err)
  return {
    label: fileLabel(dir, name, dir === cwdDir),
    path: `${dir}/${name}`,
    hash: await sha256(`failed:${reason}`),
    fixes: [],
    problems: [`読み書きに失敗した (${quote(reason)})。ファイルの権限と大きさを確かめる`],
  }
}

/**
 * Records another repository's docs/issue/ as it stands, writing nothing: the
 * state the next tool call is compared against, so that only what this
 * session's tools change there is normalized.
 */
async function baseline($: $, dir: string, state: Snapshot): Promise<void> {
  const seen = await observe($, dir, state)
  if (seen === undefined) return
  for (const c of seen.changed) state.files.set(c.name, { ...c.stamp, hash: c.hash, entry: normalizeIssue(c.name, c.text).entry })
  state.index = seen.index
}

/**
 * Looks at one watched directory and, when it needs a pass (`needsPass`),
 * runs the frontmatter and archive steps on the changed files and regenerates
 * INDEX.md (written only when its text differs). A file that cannot be read
 * or written is reported and the rest go on.
 */
async function syncDir($: $, dir: string, state: Snapshot): Promise<DirReport> {
  const isCwd = dir === cwdDir
  const report: DirReport = { label: dirLabel(dir, isCwd), files: [], isIndexUpdated: false }
  const seen = await observe($, dir, state)
  if (seen === undefined) return report
  report.files.push(...seen.failed)
  const plan = { changed: seen.changed.length, removed: seen.removed.length, isIndexTouched: seen.isIndexTouched }
  if (!needsPass(isCwd, plan)) return report

  for (const c of seen.changed) {
    try {
      report.files.push(await settleFile($, dir, state, c.name, c.text))
    } catch (err) {
      state.files.delete(c.name)
      report.files.push(await failureReport(dir, c.name, err))
    }
  }

  const entries: IndexEntry[] = [...state.files.values()].map((k) => k.entry)
  const indexPath = `${dir}/${INDEX_NAME}`
  const index = renderIndex(entries)
  try {
    if ((await readIfThere($, indexPath)) !== index) {
      await $.fs.write(indexPath, index)
      report.isIndexUpdated = true
    }
  } catch (err) {
    report.files.push(await failureReport(dir, INDEX_NAME, err))
  }
  state.index = await stampOf($, indexPath)
  return report
}

async function syncAll($: $): Promise<DirReport[]> {
  const reports: DirReport[] = []
  for (const [dir, state] of dirs) reports.push(await syncDir($, dir, state))
  return reports
}

/** The problems of a file not yet told for its current content. */
function untoldProblems(r: FileReport): string[] {
  const prev = told.get(r.path)
  if (prev === undefined || prev.hash !== r.hash) return [...r.problems]
  return r.problems.filter((p) => !prev.texts.has(p))
}

/** Whether a report still describes the file as it is now known (not changed, moved or gone since). */
function isCurrent(r: FileReport): boolean {
  const cut = r.path.lastIndexOf('/')
  return dirs.get(r.path.slice(0, cut))?.files.get(r.path.slice(cut + 1))?.hash === r.hash
}

/** Records problems as told, once they have reached an agent. */
function markTold(r: FileReport, problems: readonly string[]): void {
  const prev = told.get(r.path)
  const texts = prev !== undefined && prev.hash === r.hash ? prev.texts : new Set<string>()
  for (const p of problems) texts.add(p)
  told.set(r.path, { hash: r.hash, texts })
}

/**
 * Appends a note to the conversation of the agent that ran the tool, or to
 * the main conversation when that is the main loop or the subagent cannot be
 * reached (it ended). Returns whether any conversation took it.
 */
async function deliver($: $, text: string, agentId: string | undefined): Promise<boolean> {
  const message = { message: { type: 'user' as const, content: [{ type: 'text' as const, text }] } }
  if (agentId !== undefined) {
    try {
      const r = await $.session.append({ ...message, agentId })
      if (r.deny === undefined) return true
    } catch (err) {
      $.ui.log(`local-issue: append to ${agentId} failed: ${errorText(err)}`, { to: 'debug' })
    }
  }
  try {
    const r = await $.session.append(message)
    return r.deny === undefined
  } catch (err) {
    $.ui.log(`local-issue: append failed: ${errorText(err)}`, { to: 'debug' })
    return false
  }
}

/** The cwd's docs/issue/ may be created after the session started: watch it from then on, whole. */
async function findCwdDir($: $): Promise<void> {
  if (cwdDir !== undefined) return
  cwdDir = await realDir($, `${cwd}/docs/issue`)
  if (cwdDir !== undefined && !dirs.has(cwdDir)) dirs.set(cwdDir, { files: new Map(), index: undefined })
}

/**
 * Adds the docs/issue/ directories a writing tool call names. Before the tool
 * runs, a new directory is recorded as it stands (`baseline`); after it, one
 * that did not exist before starts empty, so everything in it counts as the
 * tool's doing.
 */
async function watchNamed($: $, texts: readonly string[], isBefore: boolean): Promise<void> {
  if (texts.length === 0) return
  const home = await $.env.get('HOME')
  for (const candidate of issueDirsIn(texts, cwd, home)) {
    const dir = await realDir($, candidate)
    if (dir === undefined || dirs.has(dir)) continue
    const state: Snapshot = { files: new Map(), index: undefined }
    dirs.set(dir, state)
    if (isBefore) await baseline($, dir, state)
  }
}

/** Re-records every other repository's docs/issue/ right before a tool runs, so a change made meanwhile by someone else is not taken for this tool's. */
async function baselineOthers($: $): Promise<void> {
  for (const [dir, state] of dirs) if (dir !== cwdDir) await baseline($, dir, state)
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    dirs.clear()
    told.clear()
    undelivered.clear()
    pendingNotice = undefined
    cwd = await $.session.cwd()
    cwdDir = await realDir($, `${cwd}/docs/issue`)
    if (cwdDir === undefined) return r
    const dir = cwdDir
    const state: Snapshot = { files: new Map(), index: undefined }
    dirs.set(dir, state)
    const report = await serial(() => syncDir($, dir, state))
    const withProblems = report.files.filter((x) => x.problems.length > 0)
    const notice = startupNotice({
      fixed: report.files.filter((x) => x.fixes.length > 0).map((x) => ({ label: x.label, fixes: x.fixes })),
      problems: withProblems.map((x) => ({ label: x.label, problems: x.problems })),
      isIndexUpdated: report.isIndexUpdated,
      active: [...state.files.values()].map((k) => k.entry),
      threshold: parseThreshold(await $.env.get('CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD')),
    })
    if (notice.text !== undefined)
      pendingNotice = { text: notice.text, reports: withProblems.filter((x) => notice.told.includes(x.label)) }
    return r
  })

  // The startup summary rides on the first prompt; it is let go only once a
  // prompt carrying it went in (not dropped by a hook above).
  on('prompt.submit', async ($, e, next) => {
    const pending = pendingNotice
    if (pending === undefined) return next(e)
    const r = await next({ ...e, context: [...(e.context ?? []), pending.text] })
    if (r.drop === undefined && pendingNotice === pending) {
      pendingNotice = undefined
      for (const x of pending.reports) markTold(x, x.problems)
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    if (cwd === '') return next(e)
    const texts = writeTexts(e.tool, {
      filePath: 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : undefined,
      command: 'command' in e && typeof e.command === 'string' ? e.command : undefined,
    })
    await serial(async () => {
      await findCwdDir($)
      await watchNamed($, texts, true)
      await baselineOthers($)
    })
    const r = await next(e)
    const reports = await serial(async () => {
      await findCwdDir($)
      await watchNamed($, texts, false)
      return syncAll($)
    })

    const files = reports.flatMap((d) => d.files)
    const retry = [...undelivered.values()].filter((x) => !files.some((f) => f.path === x.path) && isCurrent(x))
    undelivered.clear()
    const toTell = [...files, ...retry].flatMap((x) => {
      const fresh = untoldProblems(x)
      return fresh.length === 0 ? [] : [{ report: x, problems: fresh }]
    })
    if (toTell.length > 0) {
      const text = toTell.map((t) => problemLine(t.report.label, t.problems)).join('\n')
      if (await deliver($, text, e.agentId)) for (const t of toTell) markTold(t.report, t.problems)
      else for (const t of toTell) undelivered.set(t.report.path, t.report)
    }

    const lines = [
      ...files.filter((x) => x.fixes.length > 0).map((x) => fixLine(x.label, x.fixes)),
      ...reports.filter((d) => d.isIndexUpdated).map((d) => indexLine(d.label)),
    ]
    if (lines.length === 0 || r.deny !== undefined) return r
    return { ...r, context: [...(r.context ?? []), ...lines] }
  })
}
