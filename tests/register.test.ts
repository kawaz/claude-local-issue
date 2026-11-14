// hooks/register.ts driven through the engine's own `$` (claude plugin test).
// The world under the hooks is played by the test: an in-memory file system
// (fs.*), `mkdir` / `mv` (process.run), the conversation (session.append) and
// the tool itself (a Bash call whose effect each case sets). What is fixed
// here is the order of reads, writes, moves and tellings around a tool call;
// the frontmatter rules themselves are test/issue.spec.ts's.

import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const CWD = '/w'
const DIR = '/w/docs/issue'
const OTHER = '/o/docs/issue'
const NAME = '2026-11-14-foo.md'

const fm = (...lines: string[]): string => `---\n${lines.join('\n')}\n---\n`
const GOOD = fm('title: Foo', 'status: open', 'category: bug', 'created: 2026-11-14') + 'body\n'

type World = {
  files: Map<string, { text: string; mtimeMs: number }>
  /** What the next tool call does to the files. */
  tool: () => void
  /** Called on every read, before it answers: a way to change a file between the plugin's reads. */
  onRead: (path: string) => void
  failWrites: Set<string>
  refuseAppend: boolean
  /** The text of every row appended to a conversation. */
  appended: () => string[]
  write: (path: string, text: string) => void
}

const isDir = (w: World, path: string): boolean => [...w.files.keys()].some((p) => p.startsWith(`${path}/`))

/** Seats the test's world under every hook the plugin calls. */
function world(on: On, initial: Record<string, string>): World {
  let clock = 1
  const w: World = {
    files: new Map(),
    tool: () => undefined,
    onRead: () => undefined,
    failWrites: new Set(),
    refuseAppend: false,
    appended: () => [],
    write: (path, text) => {
      clock += 1
      w.files.set(path, { text, mtimeMs: clock })
    },
  }
  for (const [path, text] of Object.entries(initial)) w.write(path, text)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: CWD }))
  on('env.get', () => ({ value: undefined }))
  on('fs.stat', (_$, e) => {
    const f = w.files.get(e.path)
    if (f !== undefined) return { value: { kind: 'file' as const, size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } }
    if (isDir(w, e.path)) return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false, realPath: e.path } }
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('fs.exists', (_$, e) => ({ value: w.files.has(e.path) || isDir(w, e.path) }))
  on('fs.list', (_$, e) => {
    const entries = new Map<string, { name: string; kind: 'file' | 'dir'; size: number; mtimeMs: number; isLink: boolean }>()
    for (const [p, f] of w.files) {
      if (!p.startsWith(`${e.path}/`)) continue
      const rest = p.slice(e.path.length + 1)
      const name = rest.split('/')[0] ?? rest
      entries.set(name, rest.includes('/') ? { name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false } : { name, kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })
    }
    if (entries.size === 0) throw new Error(`ENOENT: ${e.path}`)
    return { value: [...entries.values()] }
  })
  on('fs.read', (_$, e) => {
    w.onRead(e.path)
    const f = w.files.get(e.path)
    if (f === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: f.text }
  })
  on('fs.write', (_$, e) => {
    if (w.failWrites.has(e.path)) throw new Error(`EACCES: ${e.path}`)
    w.write(e.path, e.text)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    const [cmd, , from, to] = e.argv
    if (cmd === 'mv' && from !== undefined && to !== undefined) {
      const f = w.files.get(from)
      if (f !== undefined && !w.files.has(to)) {
        w.files.delete(from)
        w.files.set(to, f)
      }
    }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // A conversation that cannot be reached answers deny; the rows that do go
  // in are recorded by mock.session underneath.
  on('session.append', {}, (_$, e, next) => (w.refuseAppend ? { deny: 'no running loop' } : next(e)))
  const session = mock.session(on)
  w.appended = () =>
    session.appended().map((row) => row.message.content.map((c) => (typeof c.text === 'string' ? c.text : '')).join(''))
  on('tool.call', () => {
    w.tool()
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return w
}

const start = (engine: { session: { start: (e: { surface: 'terminal'; isInteractive: boolean; cwd: string }) => Promise<unknown> } }): Promise<unknown> =>
  engine.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD })

describe('register', () => {
  // The whole loop of one tool call: the file the tool wrote is normalized
  // before the result goes back, the fix rides on the result as one line, the
  // INDEX update is named once, and what only the agent can fix is appended.
  test('a changed file is fixed, told on the result, and its problem appended', async ($, on) => {
    const w = world(on, { [`${DIR}/${NAME}`]: GOOD })
    await start($)
    w.tool = () => w.write(`${DIR}/2026-11-14-bar.md`, '# Bar\n\nbody\n')
    const r = await $.tool.call({ tool: 'Bash', command: 'printf x > docs/issue/2026-11-14-bar.md' })
    expect(w.files.get(`${DIR}/2026-11-14-bar.md`)?.text).toBe(fm('title: Bar', 'status: open', 'created: 2026-11-14') + '# Bar\n\nbody\n')
    expect(r.context).toEqual([
      'local-issue: docs/issue/2026-11-14-bar.md: frontmatter を足した、title を補った、status を補った、created を補った',
      'local-issue: docs/issue: INDEX.md を更新した (issue の変更と同じ commit に入れる)',
    ])
    expect(w.appended()).toEqual([expect.stringContaining('local-issue: docs/issue/2026-11-14-bar.md: category が無い')])
    expect(w.files.get(`${DIR}/INDEX.md`)?.text).toContain('[bar](./2026-11-14-bar.md) | Bar |')
  })

  // The same problem of the same content is told once; a change of content
  // makes it new again.
  test('a problem is not repeated until the file changes', async ($, on) => {
    const w = world(on, {})
    w.write(`${DIR}/README.md`, 'x')
    await start($)
    w.tool = () => w.write(`${DIR}/${NAME}`, '# Foo\n')
    await $.tool.call({ tool: 'Bash', command: 'a' })
    w.tool = () => undefined
    await $.tool.call({ tool: 'Bash', command: 'b' })
    expect(w.appended()).toHaveLength(1)
    w.tool = () => w.write(`${DIR}/${NAME}`, `${w.files.get(`${DIR}/${NAME}`)?.text ?? ''}more\n`)
    await $.tool.call({ tool: 'Bash', command: 'c' })
    expect(w.appended()).toHaveLength(2)
  })

  // A problem that reached no conversation is not counted as told: the next
  // check sends it again.
  test('an undelivered problem is sent again', async ($, on) => {
    const w = world(on, {})
    w.write(`${DIR}/README.md`, 'x')
    await start($)
    w.refuseAppend = true
    w.tool = () => w.write(`${DIR}/${NAME}`, '# Foo\n')
    await $.tool.call({ tool: 'Bash', command: 'a' })
    expect(w.appended()).toHaveLength(0)
    w.refuseAppend = false
    w.tool = () => undefined
    await $.tool.call({ tool: 'Bash', command: 'b' })
    expect(w.appended()).toEqual([expect.stringContaining('category が無い')])
  })

  // When the file changes between the plugin's read and its write, the work
  // is redone on the newer text instead of writing over it.
  test('a file changed right before the write back is normalized again from the newer text', async ($, on) => {
    const w = world(on, {})
    w.write(`${DIR}/README.md`, 'x')
    await start($)
    let reads = 0
    w.onRead = (path) => {
      if (path !== `${DIR}/${NAME}`) return
      reads += 1
      if (reads === 2) w.write(path, fm('title: Newer', 'status: WIP', 'category: bug', 'created: 2026-11-14') + 'newer body\n')
    }
    w.tool = () => w.write(`${DIR}/${NAME}`, fm('title: Older', 'status: OPEN', 'category: bug', 'created: 2026-11-14') + 'older body\n')
    await $.tool.call({ tool: 'Bash', command: 'a' })
    expect(w.files.get(`${DIR}/${NAME}`)?.text).toBe(fm('title: Newer', 'status: wip', 'category: bug', 'created: 2026-11-14') + 'newer body\n')
  })

  // A closed file goes to archive/ under the same name, and the move is told;
  // relative links of its body are counted on that line (the body is kept).
  test('a closed file moves to archive/', async ($, on) => {
    const w = world(on, { [`${DIR}/${NAME}`]: GOOD })
    await start($)
    const closed = fm('title: Foo', 'status: resolved', 'category: bug', 'created: 2026-11-14', 'close_reason: implemented') + 'see [DR](../decisions/DR-0006.md)\n'
    w.tool = () => w.write(`${DIR}/${NAME}`, closed)
    const r = await $.tool.call({ tool: 'Bash', command: 'a' })
    expect(w.files.get(`${DIR}/archive/${NAME}`)?.text).toBe(closed)
    expect(r.context?.[0]).toBe(`local-issue: docs/issue/${NAME}: docs/issue/archive/${NAME} へ移した。本文の相対リンク 1 個は 1 段深くなったので ../ を ../../ に直す`)
    expect(w.files.has(`${DIR}/${NAME}`)).toBe(false)
    expect(w.files.get(`${DIR}/archive/${NAME}`)?.text).toContain('status: resolved')
    expect(r.context).toEqual([expect.stringContaining(`docs/issue/archive/${NAME} へ移した`), 'local-issue: docs/issue: INDEX.md を更新した (issue の変更と同じ commit に入れる)'])
    expect(w.files.get(`${DIR}/INDEX.md`)?.text).not.toContain(NAME)
  })

  // A file of the same name already in archive/ is never replaced: the file
  // stays and the agent is told why.
  test('a name already in archive/ stops the move', async ($, on) => {
    const w = world(on, { [`${DIR}/${NAME}`]: GOOD, [`${DIR}/archive/${NAME}`]: 'older close\n' })
    await start($)
    w.tool = () => w.write(`${DIR}/${NAME}`, GOOD.replace('status: open', 'status: resolved\nclose_reason: implemented'))
    await $.tool.call({ tool: 'Bash', command: 'a' })
    expect(w.files.get(`${DIR}/archive/${NAME}`)?.text).toBe('older close\n')
    expect(w.files.has(`${DIR}/${NAME}`)).toBe(true)
    expect(w.appended()).toEqual([expect.stringContaining('archive/ に同じ名前のファイル')])
  })

  // The file is read again right before the move: when it was reopened in the
  // meantime it is judged again, and an open issue stays where it is.
  test('a file reopened right before the move stays', async ($, on) => {
    const w = world(on, { [`${DIR}/${NAME}`]: GOOD })
    await start($)
    const closed = GOOD.replace('status: open', 'status: resolved\nclose_reason: implemented')
    let reads = 0
    w.onRead = (path) => {
      if (path !== `${DIR}/${NAME}`) return
      reads += 1
      if (reads === 2) w.write(path, GOOD.replace('body', 'reopened body'))
    }
    w.tool = () => w.write(`${DIR}/${NAME}`, closed)
    await $.tool.call({ tool: 'Bash', command: 'a' })
    expect(w.files.get(`${DIR}/${NAME}`)?.text).toContain('reopened body')
    expect(w.files.has(`${DIR}/archive/${NAME}`)).toBe(false)
  })

  // One file that cannot be written does not stop the others or the INDEX;
  // the failure is pointed out.
  test('a write failure on one file leaves the rest going', async ($, on) => {
    const w = world(on, {})
    w.write(`${DIR}/README.md`, 'x')
    await start($)
    w.failWrites.add(`${DIR}/2026-11-14-a.md`)
    w.tool = () => {
      w.write(`${DIR}/2026-11-14-a.md`, fm('title: A', 'status: OPEN', 'category: bug', 'created: 2026-11-14'))
      w.write(`${DIR}/2026-11-14-b.md`, fm('title: B', 'status: OPEN', 'category: bug', 'created: 2026-11-14'))
    }
    await $.tool.call({ tool: 'Bash', command: 'a' })
    expect(w.files.get(`${DIR}/2026-11-14-b.md`)?.text).toContain('status: open')
    expect(w.files.get(`${DIR}/INDEX.md`)?.text).toContain('[b](./2026-11-14-b.md) | B |')
    expect(w.appended()).toEqual([expect.stringContaining('docs/issue/2026-11-14-a.md: 読み書きに失敗した')])
  })

  // In another repository only what this session's tool changed is touched:
  // naming it (here in a Bash command) records it as it stands, its other
  // files and its INDEX stay as they are; a file the tool writes there is
  // normalized and its INDEX generated.
  test('another repository: only the files the tool changed', async ($, on) => {
    const old = fm('Title: Old', 'status: OPEN', 'foo: x') + 'old body\n'
    const w = world(on, { [`${DIR}/${NAME}`]: GOOD, [`${OTHER}/2026-01-01-old.md`]: old, [`${OTHER}/INDEX.md`]: 'hand made\n' })
    await start($)
    w.tool = () => undefined
    await $.tool.call({ tool: 'Bash', command: `cat ${OTHER}/2026-01-01-old.md` })
    expect(w.files.get(`${OTHER}/2026-01-01-old.md`)?.text).toBe(old)
    expect(w.files.get(`${OTHER}/INDEX.md`)?.text).toBe('hand made\n')
    w.tool = () => w.write(`${OTHER}/2026-11-14-new.md`, fm('title: New', 'status: OPEN', 'category: request', 'created: 2026-11-14'))
    const r = await $.tool.call({ tool: 'Bash', command: `printf x > ${OTHER}/2026-11-14-new.md` })
    expect(w.files.get(`${OTHER}/2026-11-14-new.md`)?.text).toContain('status: open')
    expect(w.files.get(`${OTHER}/2026-01-01-old.md`)?.text).toBe(old)
    expect(w.files.get(`${OTHER}/INDEX.md`)?.text).toContain('[new](./2026-11-14-new.md) | New |')
    expect(r.context).toContain(`local-issue: ${OTHER}: INDEX.md を更新した (issue の変更と同じ commit に入れる)`)
  })

  // The startup summary rides on the first prompt only.
  test('the startup summary is added to the first prompt once', async ($, on) => {
    const w = world(on, { [`${DIR}/${NAME}`]: fm('title: Foo', 'status: OPEN', 'category: bug', 'created: 2026-11-14') })
    const seen: (readonly string[] | undefined)[] = []
    on('prompt.submit', (_$, e) => {
      seen.push(e.context)
      return { text: e.text }
    })
    await start($)
    await $.prompt.submit({ text: 'one', wait: false, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'two', wait: false, origin: { kind: 'composer' } })
    expect(seen).toHaveLength(2)
    expect(seen[0]).toEqual([expect.stringContaining('起動時に docs/issue を検査した。直した 1 件')])
    expect(seen[1] ?? []).toEqual([])
    expect(w.files.get(`${DIR}/${NAME}`)?.text).toContain('status: open')
  })

  // A prompt dropped by a hook above did not carry the summary: it waits for
  // the next prompt.
  test('a dropped prompt keeps the startup summary for the next one', async ($, on) => {
    world(on, { [`${DIR}/${NAME}`]: fm('title: Foo', 'status: OPEN', 'category: bug', 'created: 2026-11-14') })
    const seen: (readonly string[] | undefined)[] = []
    let isDropping = true
    on('prompt.submit', (_$, e) => {
      seen.push(e.context)
      return isDropping ? { drop: 'test' } : { text: e.text }
    })
    await start($)
    await $.prompt.submit({ text: 'one', wait: false, origin: { kind: 'composer' } })
    isDropping = false
    await $.prompt.submit({ text: 'two', wait: false, origin: { kind: 'composer' } })
    expect(seen[1]).toEqual([expect.stringContaining('起動時に docs/issue を検査した')])
  })
})
