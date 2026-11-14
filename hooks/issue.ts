// What a docs/issue file should look like, what INDEX.md says, which files
// changed since the last look, and how each is told. Nothing here touches the
// engine (`$`): register.ts reads and writes the files and passes the text in,
// so every decision is a plain function of its input and bun test drives it
// directly.
//
// Design rationale: the frontmatter is read by a line parser written here
// instead of a YAML library or a schema library (valibot / zod). A hooks module
// can import only relative files and "claude-code", so a library would have to
// be bundled into the module; the frontmatter this plugin owns is a flat list
// of `key: value` lines with eight known keys, which one small parser covers.
// The parser is the boundary: text goes in, typed fields come out, and no
// unknown value travels further.

const STATUSES = ['idea', 'open', 'wip', 'blocked', 'resolved', 'discarded'] as const
const CATEGORIES = ['idea', 'bug', 'request', 'design', 'task', 'tech-memo'] as const
const CLOSE_REASONS = ['implemented', 'documented', 'discarded', 'duplicate'] as const

type Status = (typeof STATUSES)[number]

/** The statuses that close an issue: a file with one of them and nothing pointed out moves to archive/. */
const CLOSING: readonly Status[] = ['resolved', 'discarded']

/** A status value read as `open`. */
const READ_AS_OPEN = 'pending-sublimation'

const FIELD_ORDER = [
  'title',
  'status',
  'category',
  'created',
  'origin',
  'blocked_by',
  'close_reason',
  'close_ref',
] as const
type FieldName = (typeof FIELD_ORDER)[number]

/** Longest `blocked_by` / `close_ref` (DR-0006 §3): short enough to sit in an INDEX cell. */
const SHORT_LIMIT = 30
/** Longest title shown in INDEX.md before it is cut (DR-0006 §5). */
const TITLE_LIMIT = 60
/** Longest stretch of a file's own text quoted in what the agent is told (DR-0006 §7). */
const QUOTE_LIMIT = 40
/** Most files named in the startup summary (DR-0006 §7). */
const LISTED_MAX = 5

const FILE_NAME = /^(\d{4})-(\d{2})-(\d{2})-([a-z0-9][a-z0-9-]*)\.md$/
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2})(?::?(\d{2}))?)?)?$/
const KEY_LINE = /^([A-Za-z_][\w-]*):(.*)$/
const FENCE = /^---[ \t]*$/
const CONFLICT_MARK = /^(?:<{7}|={7}|>{7}|%{7}|\+{7}|-{7})/
const CODE_FENCE = /^ {0,3}(?:```|~~~)/
const BOM = '﻿'

export const INDEX_NAME = 'INDEX.md'
export const INDEX_NOTICE =
  'このファイルは local-issue が各 issue の frontmatter から生成する。手で編集しない (編集しても次の生成で戻る)。'

const list = (values: readonly string[]): string => values.join(' / ')

/** A stretch of a file's own text, quoted and cut, so it reads as data and not as an instruction. */
export function quote(s: string): string {
  const chars = [...s]
  return JSON.stringify(chars.length > QUOTE_LIMIT ? `${chars.slice(0, QUOTE_LIMIT).join('')}…` : s)
}

// ---------- file names ----------

/** Whether a name in docs/issue/ is an issue file: a `.md` other than the INDEX and README files, in any case. */
export function isIssueFile(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.md') && lower !== INDEX_NAME.toLowerCase() && !lower.startsWith('readme')
}

/** Whether y-m-d is a day on the calendar (2026-02-30 is not). */
function isCalendarDate(y: string, m: string, d: string): boolean {
  const t = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return t.getUTCFullYear() === Number(y) && t.getUTCMonth() === Number(m) - 1 && t.getUTCDate() === Number(d)
}

/** An ISO 8601 date or date-time whose date is on the calendar and whose clock is in range. */
function isIsoDate(s: string): boolean {
  const m = ISO_DATE_TIME.exec(s)
  if (m === null) return false
  const [, y = '', mo = '', d = '', hh, mm, ss, oh, om] = m
  const inRange = (v: string | undefined, max: number): boolean => v === undefined || Number(v) <= max
  return isCalendarDate(y, mo, d) && inRange(hh, 23) && inRange(mm, 59) && inRange(ss, 60) && inRange(oh, 23) && inRange(om, 59)
}

type FileName = { date: string; slug: string }

/** The date and slug of a well-formed issue file name (with a calendar date), or undefined. */
export function parseFileName(name: string): FileName | undefined {
  const m = FILE_NAME.exec(name)
  if (m === null) return undefined
  const [, y = '', mo = '', d = '', slug = ''] = m
  return isCalendarDate(y, mo, d) ? { date: `${y}-${mo}-${d}`, slug } : undefined
}

// ---------- frontmatter ----------

type Split =
  | { kind: 'none'; bom: string; body: string }
  | { kind: 'untouchable'; problem: string }
  | { kind: 'present'; bom: string; lines: string[]; body: string }

/**
 * Cuts a file into its frontmatter lines and its body.
 *
 * A leading BOM is kept apart and written back in front. The body is every
 * byte after the closing `---` line (its line break included), so writing
 * `<new frontmatter>` + body leaves the body as it was. A file whose
 * frontmatter cannot be cut safely is `untouchable`: it is pointed out and
 * left as it is.
 */
function splitFrontmatter(text: string): Split {
  const bom = text.startsWith(BOM) ? BOM : ''
  const rest = text.slice(bom.length)
  const lines = rest.split('\n').map((l) => l.replace(/\r$/, ''))
  if (lines[0] === undefined || !FENCE.test(lines[0])) {
    if (hasLateFrontmatter(lines))
      return { kind: 'untouchable', problem: 'frontmatter の --- の前に空行か他の行がある。--- をファイルの 1 行目に置く' }
    return { kind: 'none', bom, body: rest }
  }
  const unclosed: Split = { kind: 'untouchable', problem: 'frontmatter の終わりの --- 行が無い。frontmatter の後に --- の行を足す' }
  const first = rest.indexOf('\n')
  if (first === -1) return unclosed
  const fm: string[] = []
  let pos = first + 1
  for (;;) {
    const nl = rest.indexOf('\n', pos)
    const line = rest.slice(pos, nl === -1 ? rest.length : nl).replace(/\r$/, '')
    if (FENCE.test(line)) {
      if (fm.some((l) => CONFLICT_MARK.test(l)))
        return { kind: 'untouchable', problem: 'frontmatter に conflict の印がある。conflict を解いて印の行を消す' }
      return { kind: 'present', bom, lines: fm, body: nl === -1 ? '' : rest.slice(nl + 1) }
    }
    fm.push(line)
    if (nl === -1) return unclosed
    pos = nl + 1
  }
}

/**
 * A frontmatter that does not start the file: before any code fence, a `---`
 * line followed by a block that names a known field and closes with `---`.
 */
function hasLateFrontmatter(lines: readonly string[]): boolean {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (CODE_FENCE.test(line)) return false
    if (!FENCE.test(line)) continue
    for (let j = i + 1; j < lines.length; j++) {
      const inner = lines[j] ?? ''
      if (FENCE.test(inner)) return lines.slice(i + 1, j).some((l) => fieldOf(l) !== undefined)
    }
    return false
  }
  return false
}

/** The known field a line names, if it is a `field: value` line. */
function fieldOf(line: string): FieldName | undefined {
  const m = KEY_LINE.exec(line)
  return m === null || m[1] === undefined ? undefined : oneOf(FIELD_ORDER, m[1].toLowerCase())
}

/** `key` is the field name in lower case; `written` is the name as it stood in the file. */
type Entry = { key: string; written: string; raw: string; extra: string[] }

/**
 * The `field: value` entries of a frontmatter, in order, and the lines before
 * the first entry that are not entries.
 *
 * Field names are read in lower case (`Title:` is `title`). `name:value`
 * without a space is an entry only for the known fields, so a line such as a
 * URL is not taken for a field. A line after an entry that is not an entry
 * continues that entry's value (a value over several lines). Blank lines and
 * comment-only lines are not kept.
 */
function parseEntries(lines: readonly string[]): { entries: Entry[]; strays: string[] } {
  const entries: Entry[] = []
  const strays: string[] = []
  let last: Entry | undefined
  for (const line of lines) {
    if (/^\s*(?:#.*)?$/.test(line)) continue
    const m = KEY_LINE.exec(line)
    const name = m?.[1]
    const rest = m?.[2] ?? ''
    const isEntry = name !== undefined && (rest === '' || /^[ \t]/.test(rest) || oneOf(FIELD_ORDER, name.toLowerCase()) !== undefined)
    if (isEntry) {
      last = { key: name.toLowerCase(), written: name, raw: rest.trim(), extra: [] }
      entries.push(last)
    } else if (last !== undefined) last.extra.push(line)
    else strays.push(line)
  }
  return { entries, strays }
}

/**
 * The string a one-line YAML value spells: quotes removed, and outside quotes
 * a ` #` and what follows is a comment.
 */
function scalar(raw: string): string {
  const s = raw.trim()
  if (s.startsWith('"')) {
    for (let i = 1; i < s.length; i++) {
      const c = s.charAt(i)
      if (c === '\\') i++
      else if (c === '"') {
        const quoted = s.slice(0, i + 1)
        try {
          const v: unknown = JSON.parse(quoted)
          if (typeof v === 'string') return v
        } catch {
          // escapes JSON does not know: fall back to the text between the quotes
        }
        return quoted.slice(1, -1)
      }
    }
    return s.slice(1)
  }
  if (s.startsWith("'")) {
    let out = ''
    for (let i = 1; i < s.length; i++) {
      const c = s.charAt(i)
      if (c !== "'") out += c
      else if (s.charAt(i + 1) === "'") {
        out += "'"
        i++
      } else return out
    }
    return out
  }
  if (s.startsWith('#')) return ''
  const comment = /[ \t]#/.exec(s)
  return (comment === null ? s : s.slice(0, comment.index)).trim()
}

/** A string written as a YAML value: plain when YAML reads it back unchanged, else double-quoted. */
export function yamlString(s: string): string {
  const isPlain =
    s !== '' &&
    s === s.trim() &&
    !/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) &&
    !/: |:$| #/.test(s) &&
    !/^(?:true|false|yes|no|on|off|null|~|[-+]?\d[\d_.eE+-]*)$/i.test(s)
  return isPlain ? s : JSON.stringify(s)
}

/** Code points, so a kana or an emoji counts as one character. */
function charCount(s: string): number {
  return [...s].length
}

/** The first `# ` heading of a body, outside code fences. */
function firstHeading(body: string): string | undefined {
  let isInCode = false
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (CODE_FENCE.test(line)) isInCode = !isInCode
    if (isInCode) continue
    const m = /^# (.+)$/.exec(line)
    if (m !== null && m[1] !== undefined && m[1].trim() !== '') return m[1].trim()
  }
  return undefined
}

function oneOf<T extends string>(values: readonly T[], s: string): T | undefined {
  return values.find((v) => v === s)
}

// ---------- normalize ----------

/** The values INDEX.md shows for a file, as written when they are not valid. */
export type IndexEntry = {
  name: string
  date: string
  slug: string
  title: string
  status: string
  category: string
  blockedBy: string
}

export type Outcome = {
  /** The file as it should be; the input itself when nothing changes. */
  text: string
  /** What the plugin changed, one phrase per field (`status を直した`). */
  fixes: string[]
  /** What only the agent can settle: what is wrong and what to do, one sentence each. */
  problems: string[]
  entry: IndexEntry
  /** Closed with nothing pointed out: the file belongs in archive/. */
  isClosed: boolean
}

/**
 * Brings one issue file to the frontmatter of DR-0006 §3.
 *
 * Only the frontmatter is rewritten; the body (everything after it) is kept
 * byte for byte. Every value it fills in comes from the file itself (its name,
 * its heading), never from the clock, so the same file always gives the same
 * result.
 */
export function normalizeIssue(name: string, text: string): Outcome {
  const fileName = parseFileName(name)
  const problems: string[] = []
  if (fileName === undefined)
    problems.push(
      `ファイル名 ${quote(name)} が YYYY-MM-DD-<slug>.md (暦にある日付、slug は小文字英数字とハイフン) の形でない。この形の名前に変える`,
    )
  const entry: IndexEntry = {
    name,
    date: fileName?.date ?? '',
    slug: fileName?.slug ?? name,
    title: '',
    status: '',
    category: '',
    blockedBy: '',
  }

  const split = splitFrontmatter(text)
  if (split.kind === 'untouchable') return { text, fixes: [], problems: [...problems, split.problem], entry, isClosed: false }

  const fixes: string[] = []
  if (split.kind === 'none') fixes.push('frontmatter を足した')
  const parsed = split.kind === 'present' ? parseEntries(split.lines) : { entries: [], strays: [] }
  const removals: string[] = []
  const fields = new Map<string, Entry>()
  for (const e of parsed.entries) {
    if (fields.has(e.key)) removals.push(`重複した ${e.key} を消した`)
    else if (oneOf(FIELD_ORDER, e.key) === undefined) removals.push(`${[...e.written].slice(0, QUOTE_LIMIT).join('')} を消した`)
    else fields.set(e.key, e)
  }
  for (const line of parsed.strays) problems.push(`frontmatter の行 ${quote(line)} は 欄: 値 の形でない。欄の形に直すか消す`)

  const out: string[] = [...parsed.strays]
  const get = (key: FieldName): Entry | undefined => fields.get(key)
  const value = (e: Entry | undefined): string => (e === undefined ? '' : scalar(e.raw))
  /** Keeps a field as written, the lines of a value over several lines included. */
  const keep = (e: Entry): void => {
    out.push(e.raw === '' ? `${e.key}:` : `${e.key}: ${e.raw}`, ...e.extra)
  }
  /** A value over several lines is kept whole and pointed out, whatever the field. */
  const keepMultiLine = (e: Entry | undefined): boolean => {
    if (e === undefined || e.extra.length === 0) return false
    keep(e)
    problems.push(`${e.key} の値が複数行にわたっている。1 行にまとめて ${e.key}: <値> と書く`)
    return true
  }

  // title
  const titleEntry = get('title')
  if (keepMultiLine(titleEntry) || (titleEntry !== undefined && value(titleEntry) !== '')) {
    if (titleEntry !== undefined && titleEntry.extra.length === 0) keep(titleEntry)
    entry.title = value(titleEntry)
  } else {
    const heading = firstHeading(split.body)
    if (heading !== undefined) {
      entry.title = heading
      out.push(`title: ${yamlString(heading)}`)
      fixes.push('title を補った')
    } else {
      if (titleEntry !== undefined) keep(titleEntry)
      problems.push('title が無く、本文に # 見出しも無い。frontmatter の title: に 1 行の題を書く')
    }
  }

  // status
  const statusEntry = get('status')
  let status: Status | undefined
  if (keepMultiLine(statusEntry)) {
    entry.status = value(statusEntry)
  } else if (statusEntry === undefined || value(statusEntry) === '') {
    status = 'open'
    entry.status = status
    out.push('status: open')
    fixes.push('status を補った')
  } else {
    const written = value(statusEntry)
    const lowered = written.toLowerCase()
    status = lowered === READ_AS_OPEN ? 'open' : oneOf(STATUSES, lowered)
    if (status === undefined) {
      keep(statusEntry)
      entry.status = written
      problems.push(`status の値 ${quote(written)} は使えない。status を ${list(STATUSES)} のどれかに書き換える`)
    } else {
      entry.status = status
      if (written === status) keep(statusEntry)
      else {
        out.push(`status: ${status}`)
        fixes.push('status を直した')
      }
    }
  }

  // category
  const categoryEntry = get('category')
  if (keepMultiLine(categoryEntry)) {
    entry.category = value(categoryEntry)
  } else if (categoryEntry === undefined || value(categoryEntry) === '') {
    if (categoryEntry !== undefined) keep(categoryEntry)
    problems.push(`category が無い。frontmatter に category: を足し、${list(CATEGORIES)} のどれかを書く`)
  } else {
    const written = value(categoryEntry)
    const category = oneOf(CATEGORIES, written.toLowerCase())
    if (category === undefined) {
      keep(categoryEntry)
      entry.category = written
      problems.push(`category の値 ${quote(written)} は使えない。category を ${list(CATEGORIES)} のどれかに書き換える`)
    } else {
      entry.category = category
      if (written === category) keep(categoryEntry)
      else {
        out.push(`category: ${category}`)
        fixes.push('category を直した')
      }
    }
  }

  // created
  const createdEntry = get('created')
  const created = value(createdEntry)
  if (keepMultiLine(createdEntry)) {
    // kept as written and pointed out
  } else if (createdEntry !== undefined && isIsoDate(created)) {
    keep(createdEntry)
  } else if (fileName !== undefined) {
    out.push(`created: ${fileName.date}`)
    fixes.push(created === '' ? 'created を補った' : 'created を直した')
  } else {
    if (createdEntry !== undefined) keep(createdEntry)
    problems.push('created が無いか、暦にある日付でない。created: に YYYY-MM-DD か ISO 8601 の日時を書く')
  }

  // origin: optional, as written
  const originEntry = get('origin')
  if (keepMultiLine(originEntry)) {
    // kept as written and pointed out
  } else if (originEntry !== undefined) {
    if (value(originEntry) === '') fixes.push('origin を消した')
    else keep(originEntry)
  }

  // blocked_by: required while blocked, gone under any other valid status. An
  // invalid status keeps it: the agent is about to fix the status, and the
  // reason must not be lost on the way.
  const blockedEntry = get('blocked_by')
  const blockedBy = value(blockedEntry)
  if (keepMultiLine(blockedEntry)) {
    entry.blockedBy = blockedBy
  } else if (status === 'blocked') {
    if (blockedEntry === undefined || blockedBy === '') {
      if (blockedEntry !== undefined) fixes.push('blocked_by を消した')
      problems.push(
        `status: blocked には blocked_by が要る。frontmatter に blocked_by: を足し、${SHORT_LIMIT} 文字以内で理由を書く (裁定待ちは docs/QUESTIONS.md のラベルを先頭に)`,
      )
    } else {
      keep(blockedEntry)
      entry.blockedBy = blockedBy
      if (charCount(blockedBy) > SHORT_LIMIT)
        problems.push(`blocked_by が ${SHORT_LIMIT} 文字を超えている (${charCount(blockedBy)} 文字)。${SHORT_LIMIT} 文字以内に縮める`)
    }
  } else if (blockedEntry !== undefined) {
    if (status !== undefined || blockedBy === '') fixes.push('blocked_by を消した')
    else {
      keep(blockedEntry)
      entry.blockedBy = blockedBy
    }
  }

  // close_reason / close_ref: only under a closing status (kept under an invalid one)
  const isClosing = status !== undefined && CLOSING.includes(status)
  const reasonEntry = get('close_reason')
  const reason = value(reasonEntry)
  if (keepMultiLine(reasonEntry)) {
    // kept as written and pointed out
  } else if (isClosing) {
    if (reasonEntry === undefined || reason === '') {
      if (reasonEntry !== undefined) fixes.push('close_reason を消した')
      problems.push(`status: ${entry.status} には close_reason が要る。frontmatter に close_reason: を足し、${list(CLOSE_REASONS)} のどれかを書く`)
    } else {
      keep(reasonEntry)
      if (oneOf(CLOSE_REASONS, reason) === undefined)
        problems.push(`close_reason の値 ${quote(reason)} は使えない。close_reason を ${list(CLOSE_REASONS)} のどれかに書き換える`)
    }
  } else if (reasonEntry !== undefined) {
    if (status !== undefined || reason === '') fixes.push('close_reason を消した')
    else keep(reasonEntry)
  }

  const refEntry = get('close_ref')
  const ref = value(refEntry)
  if (keepMultiLine(refEntry)) {
    // kept as written and pointed out
  } else if (refEntry !== undefined) {
    if (ref === '' || (status !== undefined && !isClosing)) fixes.push('close_ref を消した')
    else {
      keep(refEntry)
      if (charCount(ref) > SHORT_LIMIT)
        problems.push(`close_ref が ${SHORT_LIMIT} 文字を超えている (${charCount(ref)} 文字)。${SHORT_LIMIT} 文字以内に縮める`)
    }
  }

  // A field kept under a name written with capitals: written back in lower
  // case, and named unless the field already has a phrase of its own.
  for (const key of FIELD_ORDER) {
    const e = fields.get(key)
    if (e !== undefined && e.written !== key && !fixes.some((f) => f.startsWith(`${key} を`))) fixes.push(`${key} を直した`)
  }
  fixes.push(...removals)
  const frontmatter = out.length === 0 ? '---\n---\n' : `---\n${out.join('\n')}\n---\n`
  const next = split.bom + frontmatter + split.body
  // Order, spacing, blank lines and comment lines: changed without a field to name.
  if (next !== text && fixes.length === 0) fixes.push('欄の並びと書式を直した')
  return { text: next, fixes, problems, entry, isClosed: isClosing && problems.length === 0 }
}

// ---------- INDEX.md ----------

function cell(s: string): string {
  return s.replace(/\r\n|\r|\n/g, ' ').replaceAll('\\', '\\\\').replaceAll('|', '\\|')
}

function linkText(s: string): string {
  return cell(s).replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function href(name: string): string {
  return encodeURI(name).replaceAll('(', '%28').replaceAll(')', '%29').replaceAll('#', '%23').replaceAll('?', '%3F')
}

function truncate(s: string): string {
  const chars = [...s]
  return chars.length > TITLE_LIMIT ? `${chars.slice(0, TITLE_LIMIT).join('')}…` : s
}

/** Position in INDEX.md: the statuses in their order, then any other value. */
function statusRank(status: string): number {
  const i = STATUSES.findIndex((s) => s === status)
  return i === -1 ? STATUSES.length : i
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** INDEX.md's order: status, then newest date first, then slug. */
function compareEntries(a: IndexEntry, b: IndexEntry): number {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    byText(a.status, b.status) ||
    byText(b.date, a.date) ||
    byText(a.slug, b.slug) ||
    byText(a.name, b.name)
  )
}

/** The whole of INDEX.md for the active files. */
export function renderIndex(entries: readonly IndexEntry[]): string {
  const rows = [...entries].sort(compareEntries).map((e) => {
    const link = `[${linkText(truncate(e.title === '' ? e.name : e.title))}](./${href(e.name)})`
    return `| ${[cell(e.date), cell(e.category), cell(e.status), link, cell(e.blockedBy)].join(' | ')} |`
  })
  return [INDEX_NOTICE, '', '| date | category | status | issue | blocked_by |', '|---|---|---|---|---|', ...rows, ''].join('\n')
}

// ---------- detection ----------

export type Stamp = { size: number; mtimeMs: number }
export type Listed = Stamp & { name: string }
export type Known = Stamp & { hash: string; entry: IndexEntry }
/** What is known of one watched docs/issue/: each issue file as last seen, and INDEX.md's stamp. */
export type Snapshot = { files: Map<string, Known>; index: Stamp | undefined }

type ScanPlan = {
  /** Issue files that are new or whose size or mtime moved: read them and compare hashes. */
  toRead: string[]
  /** Issue files that are gone (deleted, renamed, moved away). */
  removed: string[]
  /** INDEX.md appeared, vanished, or was written by someone else since the plugin last saw it. */
  isIndexTouched: boolean
}

const sameStamp = (a: Stamp, b: Stamp): boolean => a.size === b.size && a.mtimeMs === b.mtimeMs

/**
 * What a fresh listing of docs/issue/ asks to look at. Only the listing is
 * compared here (name, size, mtime); whether a file's content really changed
 * is the hash's to say after it is read.
 */
export function planScan(prev: Readonly<Snapshot>, listing: readonly Listed[]): ScanPlan {
  const names = new Set<string>()
  const toRead: string[] = []
  let index: Stamp | undefined
  for (const f of listing) {
    if (f.name === INDEX_NAME) {
      index = f
      continue
    }
    if (!isIssueFile(f.name)) continue
    names.add(f.name)
    const known = prev.files.get(f.name)
    if (known === undefined || !sameStamp(known, f)) toRead.push(f.name)
  }
  const removed = [...prev.files.keys()].filter((n) => !names.has(n))
  const isIndexTouched =
    index === undefined || prev.index === undefined ? index !== prev.index : !sameStamp(index, prev.index)
  return { toRead: toRead.sort(), removed: removed.sort(), isIndexTouched }
}

/**
 * The texts in which a tool call can name a docs/issue/ it writes to: the
 * `file_path` of Write and Edit, and a Bash command. A Read (or anything
 * else) names nothing, so reading another repository never makes it watched.
 */
export function writeTexts(tool: string, args: { filePath: string | undefined; command: string | undefined }): string[] {
  if ((tool === 'Write' || tool === 'Edit') && args.filePath !== undefined) return [args.filePath]
  if (tool === 'Bash' && args.command !== undefined) return [args.command]
  return []
}

/**
 * Whether a look at a directory goes on to normalize and regenerate INDEX.md.
 * The working directory's docs/issue/ is kept whole, so any change counts,
 * INDEX.md touched by someone else included. Another repository's is written
 * only for files this session's tools changed (changed or removed): its INDEX
 * and the rest of its files are that repository's own sessions' to settle.
 */
export function needsPass(isCwd: boolean, plan: { changed: number; removed: number; isIndexTouched: boolean }): boolean {
  return plan.changed > 0 || plan.removed > 0 || (isCwd && plan.isIndexTouched)
}

function normalizePath(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

const TOKEN_BREAK = /[\s'"`;|&<>()=]/

/**
 * The docs/issue directories named in the texts: `docs/issue/` inside a
 * `file_path` or a Bash command, resolved against the session's directory
 * (`~/` against home). Absolute paths, not yet resolved through symlinks.
 */
export function issueDirsIn(texts: readonly string[], cwd: string, home: string | undefined): string[] {
  const found = new Set<string>()
  const needle = 'docs/issue/'
  for (const text of texts) {
    let at = text.indexOf(needle)
    while (at !== -1) {
      let start = at
      while (start > 0 && !TOKEN_BREAK.test(text.charAt(start - 1))) start--
      const isSegment = at === start || text.charAt(at - 1) === '/'
      const prefix = text.slice(start, at + 'docs/issue'.length)
      if (isSegment) {
        if (prefix.startsWith('/')) found.add(normalizePath(prefix))
        else if (prefix.startsWith('~/')) {
          if (home !== undefined) found.add(normalizePath(`${home}/${prefix.slice(2)}`))
        } else found.add(normalizePath(`${cwd}/${prefix}`))
      }
      at = text.indexOf(needle, at + needle.length)
    }
  }
  return [...found].sort()
}

// ---------- telling ----------

const PREFIX = 'local-issue'

/**
 * How a file is named to the agent: `docs/issue/<name>` in the working
 * directory, the absolute path elsewhere. A name not of the issue form is the
 * file's own text and is quoted.
 */
export function fileLabel(dir: string, name: string, isCwd: boolean): string {
  const shown = parseFileName(name) === undefined ? quote(name) : name
  return isCwd ? `docs/issue/${shown}` : `${dir}/${shown}`
}

/** How a docs/issue/ directory is named: `docs/issue` in the working directory, the absolute path elsewhere. */
export function dirLabel(dir: string, isCwd: boolean): string {
  return isCwd ? 'docs/issue' : dir
}

/** `local-issue: docs/issue/<file>: status を直した、foo を消した` */
export function fixLine(label: string, fixes: readonly string[]): string {
  return `${PREFIX}: ${label}: ${fixes.join('、')}`
}

/** `local-issue: docs/issue: INDEX.md を更新した`, once per place whose INDEX.md was written. */
export function indexLine(label: string): string {
  return `${PREFIX}: ${label}: INDEX.md を更新した`
}

/** One line per file: what is wrong and what to do. */
export function problemLine(label: string, problems: readonly string[]): string {
  return `${PREFIX}: ${label}: ${problems.join('。')}`
}

/** The threshold for the count at startup: a whole number of 1 or more, else the default 5 (DR-0006 §7). */
export function parseThreshold(raw: string | undefined): number {
  const DEFAULT = 5
  if (raw === undefined || !/^\s*\d+\s*$/.test(raw)) return DEFAULT
  const n = Number(raw.trim())
  return Number.isSafeInteger(n) && n >= 1 ? n : DEFAULT
}

/** Oldest first: by the date in the file name, then slug. */
export function oldest(entries: readonly IndexEntry[], n: number): IndexEntry[] {
  return [...entries].sort((a, b) => byText(a.date, b.date) || byText(a.slug, b.slug)).slice(0, n)
}

export type StartupReport = {
  fixed: { label: string; fixes: string[] }[]
  problems: { label: string; problems: string[] }[]
  isIndexUpdated: boolean
  active: IndexEntry[]
  threshold: number
}

/**
 * What the first prompt carries about the startup pass, and which files'
 * problems it names (only those count as told). At most 5 files are named in
 * all, problems first since they ask for work; the rest are counted.
 */
export function startupNotice(r: StartupReport): { text: string | undefined; told: string[] } {
  const parts: string[] = []
  const told: string[] = []
  if (r.fixed.length > 0 || r.problems.length > 0) {
    parts.push(
      `${PREFIX}: 起動時に docs/issue を検査した。直した ${r.fixed.length} 件、直してほしい所がある ${r.problems.length} 件 (直した分は作業コピーに未 commit の差分として残る)。`,
    )
    const lines = [
      ...r.problems.map((p) => ({ line: `- ${p.label}: 直してほしい: ${p.problems.join('。')}`, told: p.label })),
      ...r.fixed.map((f) => ({ line: `- ${f.label}: 直した: ${f.fixes.join('、')}`, told: undefined })),
    ]
    for (const l of lines.slice(0, LISTED_MAX)) {
      parts.push(l.line)
      if (l.told !== undefined) told.push(l.told)
    }
    if (lines.length > LISTED_MAX) parts.push(`- ほか ${lines.length - LISTED_MAX} 件`)
  }
  if (r.isIndexUpdated) parts.push(indexLine('docs/issue'))
  if (r.active.length >= r.threshold) {
    const named = oldest(r.active, 3).map((e) => `docs/issue/${e.name} (${oneOf(STATUSES, e.status) ?? quote(e.status)})`)
    parts.push(`${PREFIX}: active な issue が ${r.active.length} 件ある。古い順: ${named.join('、')}`)
  }
  return { text: parts.length === 0 ? undefined : parts.join('\n'), told }
}
