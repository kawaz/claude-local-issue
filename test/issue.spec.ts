// The decisions of hooks/issue.ts, driven directly with bun test. Each case
// says why the expected result is the right one; the full rule set is DR-0006
// (§3 frontmatter, §4 close, §5 INDEX.md, §6 detection, §7 telling), restated
// here where a case depends on it.

import { describe, expect, test } from 'bun:test'
import {
  INDEX_NOTICE,
  type IndexEntry,
  type Known,
  type Outcome,
  type Snapshot,
  dirLabel,
  fileLabel,
  fixLine,
  indexLine,
  isIssueFile,
  issueDirsIn,
  needsPass,
  normalizeIssue,
  oldest,
  parseFileName,
  parseThreshold,
  planScan,
  problemLine,
  renderIndex,
  startupNotice,
  writeTexts,
  yamlString,
} from '../hooks/issue'

const NAME = '2026-11-14-sample.md'

/** Everything after the closing `---` line (and a leading BOM): the part the plugin must never change. */
function bodyOf(text: string): string {
  const t = text.replace(/^﻿/, '')
  const m = /^---[ \t]*\r?\n[\s\S]*?\n---[ \t]*(?:\r?\n|$)/.exec(t)
  return m === null ? t : t.slice(m[0].length)
}

const fm = (...lines: string[]): string => `---\n${lines.join('\n')}\n---\n`
const HEAD = ['title: t', 'status: open', 'category: bug', 'created: 2026-11-14']

/** The problems, one per needle, each containing its needle. */
function expectProblems(o: Outcome, ...needles: string[]): void {
  expect(o.problems).toHaveLength(needles.length)
  needles.forEach((n, i) => expect(o.problems[i]).toContain(n))
}

describe('file names', () => {
  // The plugin looks after docs/issue/*.md except the INDEX it generates and
  // README files a repo may keep there to explain the folder, in any case.
  test('INDEX.md, README* and non-markdown files are not issues, whatever the case', () => {
    expect(isIssueFile(NAME)).toBe(true)
    expect(isIssueFile('free-form.md')).toBe(true)
    for (const name of ['INDEX.md', 'index.md', 'Index.md', 'README.md', 'readme.md', 'README-ja.md', 'notes.txt'])
      expect(isIssueFile(name)).toBe(false)
  })

  // The place is YYYY-MM-DD-<slug>.md with slug [a-z0-9][a-z0-9-]* and a date
  // that is on the calendar; the date is what INDEX.md shows and what a
  // missing `created` is filled from, so 2026-02-30 must not pass.
  test('the well-formed name gives date and slug; anything else gives nothing', () => {
    expect(parseFileName('2026-11-14-foo-bar2.md')).toEqual({ date: '2026-11-14', slug: 'foo-bar2' })
    expect(parseFileName('2024-02-29-leap.md')).toEqual({ date: '2024-02-29', slug: 'leap' })
    for (const bad of ['2026-11-14-Foo.md', '2026-11-14--foo.md', '2026-11-14-foo_bar.md', 'foo.md', '2026-11-14-foo.markdown', '2026-02-30-foo.md', '2026-13-01-foo.md', '2025-02-29-foo.md'])
      expect(parseFileName(bad)).toBeUndefined()
  })
})

describe('normalizeIssue: a file with no frontmatter', () => {
  // A file written without frontmatter gets one: title from the first `# `
  // heading, status open, created from the file name. category has no default
  // (the writer decides it), so it is pointed out, with what to do.
  test('gets title, status and created; category is pointed out', () => {
    const text = '# Login fails on Safari\n\nSteps...\n'
    const r = normalizeIssue(NAME, text)
    expect(r.text).toBe(fm('title: Login fails on Safari', 'status: open', 'created: 2026-11-14') + text)
    expect(r.fixes).toEqual(['frontmatter を足した', 'title を補った', 'status を補った', 'created を補った'])
    expectProblems(r, 'category が無い。frontmatter に category: を足し、idea / bug / request / design / task / tech-memo のどれかを書く')
    expect(r.isClosed).toBe(false)
  })

  // The added frontmatter goes in front of the whole file with no blank line
  // between, so the body (everything after the frontmatter) is the original
  // text byte for byte.
  test('the original text becomes the body unchanged', () => {
    const text = '# T\r\nline with trailing spaces   \r\nno final newline'
    expect(bodyOf(normalizeIssue(NAME, text).text)).toBe(text)
  })

  // Without a heading there is nothing to take a title from: pointed out.
  test('no heading: title is pointed out', () => {
    expectProblems(normalizeIssue(NAME, 'just a note\n'), 'title が無く', 'category が無い')
  })

  // A `# ` line inside a code fence is code, not the issue's heading: the
  // title comes from the first heading outside fences.
  test('a "# " line inside a code fence is not the heading', () => {
    const r = normalizeIssue(NAME, '```sh\n# install\nnpm i\n```\n\n# Real title\n')
    expect(r.entry.title).toBe('Real title')
    const tilde = normalizeIssue(NAME, '~~~\n# not this\n~~~\n')
    expectProblems(tilde, 'title が無く', 'category が無い')
  })

  // A heading that YAML would misread as plain text is quoted, so the
  // frontmatter stays valid YAML for other readers (GitHub's preview).
  test('a heading with ": " is written as a quoted string', () => {
    const r = normalizeIssue(NAME, '# fix: a: b\n')
    expect(r.text.startsWith('---\ntitle: "fix: a: b"\n')).toBe(true)
    expect(r.entry.title).toBe('fix: a: b')
  })

  // A BOM stays first; the frontmatter goes after it, the rest is the body.
  test('a leading BOM is kept in front of the added frontmatter', () => {
    const r = normalizeIssue(NAME, '﻿# T\nbody\n')
    expect(r.text.startsWith('﻿---\ntitle: T\n')).toBe(true)
    expect(bodyOf(r.text)).toBe('# T\nbody\n')
  })
})

describe('normalizeIssue: files left untouched', () => {
  // These files cannot be cut into frontmatter and body safely; any rewrite
  // could eat the body or a conflict side. They are pointed out and kept
  // byte for byte until the agent fixes them.
  const untouched = (text: string, needle: string): void => {
    const r = normalizeIssue(NAME, text)
    expect(r.text).toBe(text)
    expect(r.fixes).toEqual([])
    expectProblems(r, needle)
  }

  test('a frontmatter without its closing --- line', () => {
    untouched('---\ntitle: t\nstatus: open\n\nbody without a closing fence\n', '終わりの --- 行が無い')
  })

  // Conflict marks of git (<<<<<<< ======= >>>>>>>) and jj (%%%%%%% +++++++
  // -------) inside the frontmatter: the two sides are the agent's to resolve.
  test.each(['<<<<<<< ours', '=======', '>>>>>>> theirs', '%%%%%%% diff', '+++++++ side', '------- base'])(
    'a conflict mark %p inside the frontmatter',
    (mark) => untouched(fm('title: t', mark, 'status: open', 'category: bug', 'created: 2026-11-14') + 'b\n', 'conflict の印'),
  )

  // A frontmatter preceded by a blank line or any other line is not where a
  // frontmatter is read: adding one in front would leave two.
  test('lines before the frontmatter', () => {
    untouched('\n' + fm(...HEAD) + 'b\n', '--- の前に空行か他の行がある')
    untouched('note\n' + fm(...HEAD) + 'b\n', '--- の前に空行か他の行がある')
  })

  // A `---` block inside a code fence is an example in the body, not a late frontmatter.
  test('a frontmatter example inside a code fence is body', () => {
    const r = normalizeIssue(NAME, '# T\n\n```md\n---\ntitle: x\n---\n```\n')
    expect(r.fixes).toContain('frontmatter を足した')
  })

  // A BOM in front of a well-formed frontmatter is not "a line before" it.
  test('a BOM before the frontmatter is read through', () => {
    const r = normalizeIssue(NAME, '﻿' + fm('title: t', 'status: OPEN', 'category: bug', 'created: 2026-11-14') + 'b\n')
    expect(r.text).toBe('﻿' + fm(...HEAD) + 'b\n')
    expect(r.fixes).toEqual(['status を直した'])
  })
})

describe('normalizeIssue: status', () => {
  // Case and surrounding spaces are fixed by the plugin; the agent is not bothered.
  test('upper case and spaces are fixed and named', () => {
    const r = normalizeIssue(NAME, fm('title: t', 'status:   WIP  ', 'category: bug', 'created: 2026-11-14') + 'b\n')
    expect(r.text).toBe(fm('title: t', 'status: wip', 'category: bug', 'created: 2026-11-14') + 'b\n')
    expect(r.fixes).toEqual(['status を直した'])
    expect(r.problems).toEqual([])
  })

  // pending-sublimation is a value read as open.
  test('pending-sublimation reads as open', () => {
    const r = normalizeIssue(NAME, fm('title: t', 'status: pending-sublimation', 'category: idea', 'created: 2026-11-14'))
    expect(r.entry.status).toBe('open')
    expect(r.fixes).toEqual(['status を直した'])
  })

  // A quoted valid value is the same value and is left as written.
  test('a quoted valid status is kept as written', () => {
    const r = normalizeIssue(NAME, fm('title: t', 'status: "open"', 'category: idea', 'created: 2026-11-14'))
    expect(r.text).toContain('\nstatus: "open"\n')
    expect(r.fixes).toEqual([])
  })

  // Outside quotes, ` #` starts a comment: `open # memo` is open. A valid
  // value with a comment is left as written; a quoted `#` is part of the value.
  test('a comment after the value is not part of it', () => {
    const r = normalizeIssue(NAME, fm('title: t', 'status: open # waiting for review', 'category: bug', 'created: 2026-11-14'))
    expect(r.entry.status).toBe('open')
    expect(r.problems).toEqual([])
    expect(r.text).toContain('\nstatus: open # waiting for review\n')
    expect(normalizeIssue(NAME, fm('title: "a # b"', 'status: open', 'category: bug', 'created: 2026-11-14')).entry.title).toBe('a # b')
    expect(normalizeIssue(NAME, fm('title: issue#12 fix', 'status: open', 'category: bug', 'created: 2026-11-14')).entry.title).toBe('issue#12 fix')
  })

  // An unknown value is not guessed at: pointed out with what to do, the
  // value quoted (it is the file's text, not an instruction), and kept as
  // written so INDEX.md shows what is there.
  test('an unknown status is pointed out and kept', () => {
    const r = normalizeIssue(NAME, fm('title: t', 'status: done', 'category: idea', 'created: 2026-11-14'))
    expect(r.text).toContain('\nstatus: done\n')
    expect(r.problems).toEqual(['status の値 "done" は使えない。status を idea / open / wip / blocked / resolved / discarded のどれかに書き換える'])
    expect(r.entry.status).toBe('done')
  })

  // A value quoted in what the agent is told is cut at 40 characters.
  test('a long value is cut at 40 characters when quoted', () => {
    const r = normalizeIssue(NAME, fm('title: t', `status: ${'x'.repeat(50)}`, 'category: idea', 'created: 2026-11-14'))
    expect(r.problems[0]).toContain(`"${'x'.repeat(40)}…"`)
  })

  // Missing status is filled with open (the one status with a default).
  test('a missing status becomes open', () => {
    const r = normalizeIssue(NAME, fm('title: t', 'category: idea', 'created: 2026-11-14'))
    expect(r.text).toContain('\nstatus: open\n')
    expect(r.fixes).toEqual(['status を補った'])
  })
})

describe('normalizeIssue: category and created', () => {
  test('category: case is fixed, unknown and missing are pointed out', () => {
    expect(normalizeIssue(NAME, fm('title: t', 'status: open', 'category: Tech-Memo', 'created: 2026-11-14')).fixes).toEqual(['category を直した'])
    expectProblems(normalizeIssue(NAME, fm('title: t', 'status: open', 'category: chore', 'created: 2026-11-14')), 'category の値 "chore" は使えない')
    // An empty `category:` is left for the agent to fill: the plugin has no value to put there.
    const empty = normalizeIssue(NAME, fm('title: t', 'status: open', 'category:', 'created: 2026-11-14'))
    expect(empty.text).toContain('\ncategory:\n')
    expectProblems(empty, 'category が無い')
  })

  // created takes an ISO 8601 date or date-time on the calendar, as written; a
  // missing or invalid value is replaced with the date in the file name
  // (never the clock, so the result is the same whoever runs it, whenever).
  test('created: ISO kept as written, missing or invalid taken from the file name', () => {
    const head = ['title: t', 'status: open', 'category: idea']
    expect(normalizeIssue(NAME, fm(...head, 'created: 2026-06-20T00:35:29+09:00')).fixes).toEqual([])
    expect(normalizeIssue(NAME, fm(...head, 'created: "2026-06-20"')).fixes).toEqual([])
    for (const bad of ['yesterday', '2026-02-30', '2026-11-14T25:00', '2026-13-01']) {
      const r = normalizeIssue(NAME, fm(...head, `created: ${bad}`))
      expect(r.text).toContain('\ncreated: 2026-11-14\n')
      expect(r.fixes).toEqual(['created を直した'])
    }
  })

  // With a bad file name there is no date to fill from: pointed out instead,
  // along with the name itself (the plugin never renames). The name is quoted.
  test('a bad file name: pointed out, and created cannot be filled', () => {
    const r = normalizeIssue('Notes.md', '# n\n')
    expectProblems(r, 'ファイル名 "Notes.md" が', 'category が無い', 'created が無いか')
    expect(r.entry.date).toBe('')
  })
})

describe('normalizeIssue: field names and lines', () => {
  // Only the eight fields of DR-0006 §3 stay, in that order. Other fields are
  // removed even with a value, and an optional field with no value is not written.
  test('fields outside the eight are removed', () => {
    const text =
      fm('title: 題', 'status: idea', 'category: task', 'created: 2026-06-20T00:35:29+09:00', 'foo: 2026-08-01', 'bar_entered:', 'close_reason:', 'blocked_by:', 'origin: elsewhere') +
      '\n# 題\n\n本文\n'
    const r = normalizeIssue('2026-06-20-sample.md', text)
    expect(r.text).toBe(fm('title: 題', 'status: idea', 'category: task', 'created: 2026-06-20T00:35:29+09:00', 'origin: elsewhere') + '\n# 題\n\n本文\n')
    expect(r.fixes).toEqual(['blocked_by を消した', 'close_reason を消した', 'foo を消した', 'bar_entered を消した'])
    expect(r.problems).toEqual([])
    expect(bodyOf(r.text)).toBe(bodyOf(text))
  })

  // Fields out of order are put in order. Nothing is named because no field
  // changed; the line still says the frontmatter was touched.
  test('order alone is fixed as order', () => {
    const r = normalizeIssue(NAME, fm('category: bug', 'status: open', 'title: t', 'created: 2026-11-14'))
    expect(r.text).toBe(fm(...HEAD))
    expect(r.fixes).toEqual(['欄の並びと書式を直した'])
  })

  // `field:value` without the space is read as the field for the eight known
  // names (a dropped `status:WIP` would otherwise become a filled-in open).
  test('a known field without a space after the colon is still that field', () => {
    const r = normalizeIssue(NAME, fm('title:Foo', 'status:WIP', 'category: bug', 'created: 2026-11-14') + 'b\n')
    expect(r.text).toBe(fm('title: Foo', 'status: wip', 'category: bug', 'created: 2026-11-14') + 'b\n')
    expect(r.fixes).toEqual(['status を直した'])
  })

  // For any other name `x:y` is not a field: a URL line after a field is that
  // field's value going on over a second line (kept and pointed out), not a
  // field named "https" to remove.
  test('a URL line is not a field', () => {
    const r = normalizeIssue(NAME, fm('title: t', 'status: open', 'category: bug', 'created: 2026-11-14', 'origin: see', 'https://example.com/x'))
    expect(r.text).toContain('\norigin: see\nhttps://example.com/x\n')
    expect(r.fixes).not.toContain('https を消した')
    expectProblems(r, 'origin の値が複数行にわたっている')
  })

  // A line that is not a field before any field cannot belong to one: kept
  // and pointed out, quoted.
  test('a stray line before the fields is kept and pointed out', () => {
    const r = normalizeIssue(NAME, fm('https://example.com/x', ...HEAD))
    expect(r.text).toContain('---\nhttps://example.com/x\ntitle: t\n')
    expectProblems(r, 'frontmatter の行 "https://example.com/x" は 欄: 値 の形でない')
  })

  // Field names are read in lower case: `Title:` is the title, kept and
  // written back as `title:` (named as fixed), never dropped as an unknown
  // field. Losing a hand-written title to a capital letter is the failure this
  // guards against.
  test('capitalised field names become the lower-case fields', () => {
    const r = normalizeIssue(NAME, fm('Title: Foo', 'Status: open', 'CATEGORY: Bug', 'created: 2026-11-14') + 'b\n')
    expect(r.text).toBe(fm('title: Foo', 'status: open', 'category: bug', 'created: 2026-11-14') + 'b\n')
    expect(r.fixes).toEqual(['category を直した', 'title を直した', 'status を直した'])
    expect(r.entry.title).toBe('Foo')
  })

  // When lower-casing makes two lines the same field, the duplicate rule
  // applies: the first line counts, the later one is removed.
  test('duplicates keep the first, capitalised or not', () => {
    const r = normalizeIssue(NAME, fm('title: First', 'Title: Second', 'status: open', 'category: bug', 'created: 2026-11-14'))
    expect(r.entry.title).toBe('First')
    expect(r.text).not.toContain('Second')
    expect(r.fixes).toEqual(['重複した title を消した'])
    expect(normalizeIssue(NAME, fm('title: t', 'status: open', 'status: wip', 'category: bug', 'created: 2026-11-14')).entry.status).toBe('open')
  })

  // An unknown field is removed under the name it was written with.
  test('an unknown field is named as written', () => {
    expect(normalizeIssue(NAME, fm(...HEAD, 'Some_Field: x')).fixes).toEqual(['Some_Field を消した'])
  })

  // A value over several lines is kept whole and pointed out, whatever the
  // field and whatever the status: replacing it (created from the file name),
  // reading it as missing (status open), or removing it (blocked_by under
  // open) would each lose what the writer put there.
  const H = ['title: t', 'category: bug', 'created: 2026-11-14']
  test.each([
    ['title', 'title:\n  two\n  lines', ['status: open', 'category: bug', 'created: 2026-11-14']],
    ['status', 'status:\n  open', H],
    ['category', 'category:\n  - bug', ['title: t', 'status: open', 'created: 2026-11-14']],
    ['created', 'created: |\n  2026-11-14', ['title: t', 'status: open', 'category: bug']],
    ['origin', 'origin:\n  - a\n  - b', [...HEAD]],
    ['blocked_by', 'blocked_by:\n  waiting on Q1', [...HEAD]],
    ['close_reason', 'close_reason:\n  - implemented', ['title: t', 'status: resolved', 'category: bug', 'created: 2026-11-14']],
    ['close_ref', 'close_ref:\n  v1.0.0', ['title: t', 'status: resolved', 'category: bug', 'created: 2026-11-14', 'close_reason: implemented']],
  ])('a multi-line %s is kept and pointed out', (field, block, rest) => {
    const r = normalizeIssue(NAME, fm(...rest, block))
    expect(r.text).toContain(`\n${block}\n`)
    expect(r.problems.some((p) => p.startsWith(`${field} の値が複数行にわたっている`))).toBe(true)
    expect(r.isClosed).toBe(false)
  })

  // A multi-line status is not a status: the dependent fields are kept as they
  // are under an invalid status.
  test('a multi-line status keeps blocked_by', () => {
    const r = normalizeIssue(NAME, fm('title: t', 'status:', '  blocked', 'category: bug', 'created: 2026-11-14', 'blocked_by: Q1'))
    expect(r.text).toContain('\nblocked_by: Q1\n')
  })
})

describe('normalizeIssue: blocked', () => {
  const head = ['title: t', 'status: blocked', 'category: task', 'created: 2026-11-14']

  // blocked needs a reason of up to 30 characters (counted as characters, so
  // Japanese counts one per character). 30 passes, 31 is pointed out.
  test('blocked_by is required and limited to 30 characters', () => {
    expectProblems(normalizeIssue(NAME, fm(...head)), 'status: blocked には blocked_by が要る。frontmatter に blocked_by: を足し')
    expect(normalizeIssue(NAME, fm(...head, `blocked_by: ${'あ'.repeat(30)}`)).problems).toEqual([])
    expect(normalizeIssue(NAME, fm(...head, `blocked_by: ${'あ'.repeat(31)}`)).problems).toEqual(['blocked_by が 30 文字を超えている (31 文字)。30 文字以内に縮める'])
    expect(normalizeIssue(NAME, fm(...head, 'blocked_by: Q3 待ち')).entry.blockedBy).toBe('Q3 待ち')
  })

  // Under any other valid status blocked_by means nothing and is removed. Under
  // an invalid status it is kept: the agent is about to fix the status and may
  // still mean blocked.
  test('blocked_by goes away under another valid status, stays under an invalid one', () => {
    const open = normalizeIssue(NAME, fm(...HEAD, 'blocked_by: Q3'))
    expect(open.text).not.toContain('blocked_by')
    expect(open.fixes).toEqual(['blocked_by を消した'])
    expect(open.entry.blockedBy).toBe('')
    const odd = normalizeIssue(NAME, fm('title: t', 'status: blockd', 'category: task', 'created: 2026-11-14', 'blocked_by: Q3', 'close_reason: implemented', 'close_ref: DR-1'))
    expect(odd.text).toContain('\nblocked_by: Q3\nclose_reason: implemented\nclose_ref: DR-1\n')
  })
})

describe('normalizeIssue: close', () => {
  const head = (status: string): string[] => ['title: t', `status: ${status}`, 'category: bug', 'created: 2026-11-14']

  // resolved / discarded with a valid close_reason and nothing else pointed out
  // is closed: the file belongs in archive/ (DR-0006 §4).
  test('a closing status with a valid close_reason is closed', () => {
    expect(normalizeIssue(NAME, fm(...head('resolved'), 'close_reason: implemented')).isClosed).toBe(true)
    expect(normalizeIssue(NAME, fm(...head('discarded'), 'close_reason: duplicate', 'close_ref: DR-0006')).isClosed).toBe(true)
  })

  // Without a close_reason, or with one outside the four values, it is pointed
  // out and the file stays where it is until fixed. close_reason has no case
  // fixing (DR-0006 fixes case only for status and category).
  test('missing or unknown close_reason keeps the file active', () => {
    const missing = normalizeIssue(NAME, fm(...head('resolved')))
    expect(missing.isClosed).toBe(false)
    expect(missing.problems).toEqual([
      'status: resolved には close_reason が要る。frontmatter に close_reason: を足し、implemented / documented / discarded / duplicate のどれかを書く',
    ])
    const odd = normalizeIssue(NAME, fm(...head('resolved'), 'close_reason: Implemented'))
    expect(odd.isClosed).toBe(false)
    expectProblems(odd, 'close_reason の値 "Implemented" は使えない')
  })

  // close_ref is optional, up to 30 characters; over that it is pointed out
  // and blocks the move like any other problem.
  test('close_ref over 30 characters is pointed out', () => {
    const r = normalizeIssue(NAME, fm(...head('resolved'), 'close_reason: documented', `close_ref: ${'x'.repeat(31)}`))
    expectProblems(r, 'close_ref が 30 文字を超えている')
    expect(r.isClosed).toBe(false)
  })

  // close_reason and close_ref belong to closing statuses only.
  test('close fields go away under an open status', () => {
    expect(normalizeIssue(NAME, fm(...head('wip'), 'close_reason: implemented', 'close_ref: v1')).fixes).toEqual(['close_reason を消した', 'close_ref を消した'])
  })

  // A bad file name is a problem too, so even a properly closed file with a
  // bad name stays put (archive/ keeps the same name).
  test('a bad file name keeps a closed file active', () => {
    expect(normalizeIssue('Bad.md', fm(...head('resolved'), 'close_reason: implemented')).isClosed).toBe(false)
  })
})

describe('normalizeIssue: settling', () => {
  // Running it again on its own output changes nothing: the plugin runs after
  // every tool call and must settle, not keep rewriting.
  test('normalizing twice is the same as once', () => {
    const inputs = [
      '# a\nbody',
      fm('status: OPEN', 'foo: x', 'category: Bug') + 'b',
      fm('title: t', 'status: blocked', 'category: task', 'created: 2026-11-14') + '\n---\nnot a frontmatter\n---\n',
      '﻿# T\n',
    ]
    for (const input of inputs) {
      const once = normalizeIssue(NAME, input)
      const twice = normalizeIssue(NAME, once.text)
      expect(twice.text).toBe(once.text)
      expect(twice.fixes).toEqual([])
    }
  })

  // The body keeps every byte: CRLF, a missing final newline, and `---` lines
  // that are thematic breaks in the body.
  test('the body is kept byte for byte', () => {
    const body = '\r\n# Title\r\n\r\n---\r\ntext with   trailing\t\r\n---\nend'
    expect(bodyOf(normalizeIssue(NAME, fm('status: OPEN', 'title: x') + body).text)).toBe(body)
  })
})

describe('yamlString', () => {
  // Plain where YAML reads the text back as the same string, quoted otherwise.
  test('quotes only when needed', () => {
    expect(yamlString('plain title')).toBe('plain title')
    expect(yamlString('日本語の題')).toBe('日本語の題')
    expect(yamlString('a: b')).toBe('"a: b"')
    expect(yamlString('# not a comment')).toBe('"# not a comment"')
    expect(yamlString('a #b')).toBe('"a #b"')
    expect(yamlString('true')).toBe('"true"')
    expect(yamlString('2026')).toBe('"2026"')
    expect(yamlString('say "hi"')).toBe('say "hi"')
  })
})

const entry = (name: string, status: string, title = 't', category = 'bug', blockedBy = ''): IndexEntry => {
  const parsed = parseFileName(name)
  return { name, date: parsed?.date ?? '', slug: parsed?.slug ?? name, title, status, category, blockedBy }
}

describe('renderIndex', () => {
  // The notice line comes first, then the table with the five columns of
  // DR-0006 §5.
  test('notice line, header, then rows', () => {
    expect(renderIndex([entry('2026-11-14-a.md', 'open', 'A', 'bug')])).toBe(
      [INDEX_NOTICE, '', '| date | category | status | issue | blocked_by |', '|---|---|---|---|---|', '| 2026-11-14 | bug | open | [A](./2026-11-14-a.md) |  |', ''].join('\n'),
    )
  })

  // Order: status idea → open → wip → blocked; within a status the newest date
  // first; same date by slug. Files kept active by a problem (a closing status
  // without close_reason, an invalid status) come after, so the list still
  // shows them.
  test('status order, then newest first, then slug', () => {
    const rows = renderIndex([
      entry('2026-01-01-z.md', 'open'),
      entry('2026-02-01-b.md', 'open'),
      entry('2026-02-01-a.md', 'open'),
      entry('2026-03-01-w.md', 'wip'),
      entry('2026-01-01-i.md', 'idea'),
      entry('2026-05-01-k.md', 'blocked'),
      entry('2026-05-01-r.md', 'resolved'),
      entry('2026-05-01-q.md', 'Done'),
    ])
      .split('\n')
      .filter((l) => l.startsWith('| 2026'))
      .map((l) => /\(\.\/(.+?)\)/.exec(l)?.[1])
    expect(rows).toEqual(['2026-01-01-i.md', '2026-02-01-a.md', '2026-02-01-b.md', '2026-01-01-z.md', '2026-03-01-w.md', '2026-05-01-k.md', '2026-05-01-r.md', '2026-05-01-q.md'])
  })

  // The title is the only description a row has, so INDEX.md shows it whole however long it is.
  test('a long title is shown whole', () => {
    const long = 'あ'.repeat(200)
    expect(renderIndex([entry(NAME, 'open', long)])).toContain(`[${long}](`)
  })

  // A `|` in a value would split the table cell; `[`/`]` would break the link;
  // a line break inside a value would end the table row.
  test('table and link characters and line breaks are made safe', () => {
    expect(renderIndex([entry(NAME, 'blocked', 'a | [b]', 'bug', 'Q1|Q2')])).toContain('[a \\| \\[b\\]](./2026-11-14-sample.md) | Q1\\|Q2 |')
    expect(renderIndex([entry(NAME, 'odd\nvalue', 'two\r\nlines')])).toContain('| odd value | [two lines](./')
  })

  // `#` and `?` in a file name would turn the rest of the link into a
  // fragment or a query; they are percent-encoded like spaces.
  test('# and ? in a file name are encoded in the link', () => {
    expect(renderIndex([entry('a #1?.md', 'open', 'x')])).toContain('](./a%20%231%3F.md)')
  })

  // A file without a title is still listed, by its file name.
  test('no title: the file name stands in', () => {
    expect(renderIndex([entry(NAME, 'open', '')])).toContain(`[${NAME}](./${NAME})`)
  })

  // No active issue: the table is there with no rows.
  test('no issues: an empty table', () => {
    expect(renderIndex([]).trimEnd().endsWith('|---|---|---|---|---|')).toBe(true)
  })
})

const known = (size: number, mtimeMs: number): Known => ({ size, mtimeMs, hash: 'h', entry: entry(NAME, 'open') })

describe('planScan', () => {
  const prev: Snapshot = {
    files: new Map([
      ['2026-11-14-a.md', known(10, 100)],
      ['2026-11-14-b.md', known(20, 200)],
    ]),
    index: { size: 5, mtimeMs: 50 },
  }

  // Only the listing is compared: a file is read again when it is new or its
  // size or mtime moved; an unchanged listing reads nothing (the cheap path
  // that runs after every tool call).
  test('new and moved files are read; unchanged ones are not', () => {
    const plan = planScan(prev, [
      { name: '2026-11-14-a.md', size: 10, mtimeMs: 100 },
      { name: '2026-11-14-b.md', size: 20, mtimeMs: 201 },
      { name: '2026-11-14-c.md', size: 1, mtimeMs: 1 },
      { name: 'INDEX.md', size: 5, mtimeMs: 50 },
      { name: 'readme.md', size: 1, mtimeMs: 1 },
      { name: 'note.txt', size: 1, mtimeMs: 1 },
    ])
    expect(plan).toEqual({ toRead: ['2026-11-14-b.md', '2026-11-14-c.md'], removed: [], isIndexTouched: false })
  })

  // A file gone from the listing (rm, mv) is removed; INDEX.md changes too.
  test('vanished files are reported as removed', () => {
    const plan = planScan(prev, [{ name: '2026-11-14-a.md', size: 10, mtimeMs: 100 }])
    expect(plan.removed).toEqual(['2026-11-14-b.md'])
    expect(plan.isIndexTouched).toBe(true)
  })

  // INDEX.md written, created or deleted by someone else is noticed.
  test('INDEX.md touched by someone else is noticed', () => {
    const files = [...prev.files].map(([name, k]) => ({ name, size: k.size, mtimeMs: k.mtimeMs }))
    expect(planScan(prev, [...files, { name: 'INDEX.md', size: 6, mtimeMs: 50 }]).isIndexTouched).toBe(true)
    expect(planScan({ ...prev, index: undefined }, [...files, { name: 'INDEX.md', size: 5, mtimeMs: 50 }]).isIndexTouched).toBe(true)
    expect(planScan({ ...prev, index: undefined }, files).isIndexTouched).toBe(false)
  })
})

describe('which calls watch another docs/issue', () => {
  // Only a call that can write there adds a directory to watch: Write / Edit by
  // their file_path, Bash by its command. Read (and any other tool) never
  // does, so reading another repository's issue leaves that repository alone.
  test('Write, Edit and Bash name paths; Read does not', () => {
    const p = '/other/docs/issue/2026-11-14-x.md'
    expect(writeTexts('Write', { filePath: p, command: undefined })).toEqual([p])
    expect(writeTexts('Edit', { filePath: p, command: undefined })).toEqual([p])
    expect(writeTexts('Bash', { filePath: undefined, command: `cat ${p}` })).toEqual([`cat ${p}`])
    expect(writeTexts('Read', { filePath: p, command: undefined })).toEqual([])
    expect(writeTexts('Grep', { filePath: p, command: undefined })).toEqual([])
  })

  // The working directory's docs/issue/ is kept whole: any change, an INDEX.md
  // edited by hand included, starts a pass. Another repository's is written
  // only for files this session's tools changed or removed; a touched INDEX.md
  // alone writes nothing there, and an unchanged directory gets not one byte.
  test('another repository is written only for changed or removed files', () => {
    const none = { changed: 0, removed: 0, isIndexTouched: false }
    expect(needsPass(true, none)).toBe(false)
    expect(needsPass(false, none)).toBe(false)
    expect(needsPass(true, { ...none, isIndexTouched: true })).toBe(true)
    expect(needsPass(false, { ...none, isIndexTouched: true })).toBe(false)
    expect(needsPass(false, { ...none, changed: 1 })).toBe(true)
    expect(needsPass(false, { ...none, removed: 1 })).toBe(true)
  })
})

describe('issueDirsIn', () => {
  const cwd = '/work/repo'

  // An absolute file_path names its docs/issue directory; a file under
  // archive/ names the same directory.
  test('absolute paths', () => {
    expect(issueDirsIn(['/other/proj/docs/issue/2026-11-14-x.md'], cwd, '/home/u')).toEqual(['/other/proj/docs/issue'])
    expect(issueDirsIn(['/other/proj/docs/issue/archive/x.md'], cwd, '/home/u')).toEqual(['/other/proj/docs/issue'])
  })

  // A Bash command is cut into path-like tokens: relative ones resolve against
  // the session's directory, `~/` against home, `..` is folded.
  test('paths inside a Bash command', () => {
    const cmd = `printf 'x' > docs/issue/a.md && mv "../sib/docs/issue/b.md" ~/p/docs/issue/ ; cat /abs/docs/issue/c.md`
    expect(issueDirsIn([cmd], cwd, '/home/u')).toEqual(['/abs/docs/issue', '/home/u/p/docs/issue', '/work/repo/docs/issue', '/work/sib/docs/issue'])
  })

  // `docs/issue/` must be whole path segments: `mydocs/issue/` is another
  // directory, and `docs/issues/` or a bare `docs/issue` (no file under it) is
  // not a path into the issue folder.
  test('only whole segments count', () => {
    expect(issueDirsIn(['cat mydocs/issue/x.md docs/issues/y.md ls docs/issue'], cwd, undefined)).toEqual([])
  })

  // Without HOME a `~/` path cannot be placed and is skipped.
  test('~ without home is skipped', () => {
    expect(issueDirsIn(['~/p/docs/issue/x.md'], cwd, undefined)).toEqual([])
  })
})

describe('telling', () => {
  // Files are named `docs/issue/<name>` in the working directory and by
  // absolute path elsewhere; a name that is not of the issue form is the
  // file's own text and is quoted.
  test('labels', () => {
    expect(fileLabel('/w/docs/issue', '2026-11-14-foo.md', true)).toBe('docs/issue/2026-11-14-foo.md')
    expect(fileLabel('/o/docs/issue', '2026-11-14-foo.md', false)).toBe('/o/docs/issue/2026-11-14-foo.md')
    expect(fileLabel('/w/docs/issue', 'Do this now.md', true)).toBe('docs/issue/"Do this now.md"')
    expect(dirLabel('/w/docs/issue', true)).toBe('docs/issue')
    expect(dirLabel('/o/docs/issue', false)).toBe('/o/docs/issue')
  })

  // The fix line names only the fields (DR-0006 §7's example); the INDEX line
  // is said once per place whose INDEX.md was written, so a session that
  // commits by path does not miss it.
  test('fix, INDEX and problem lines', () => {
    expect(fixLine('docs/issue/2026-11-14-foo.md', ['status を直した', 'foo を消した'])).toBe('local-issue: docs/issue/2026-11-14-foo.md: status を直した、foo を消した')
    expect(indexLine('docs/issue')).toBe('local-issue: docs/issue: INDEX.md を更新した')
    expect(problemLine('x', ['category が無い', 'title が無い'])).toBe('local-issue: x: category が無い。title が無い')
  })

  // The count threshold is a whole number of at least 1; anything else falls
  // back to 5 rather than silencing or flooding the notice.
  test('threshold parsing', () => {
    expect(parseThreshold(undefined)).toBe(5)
    expect(parseThreshold('3')).toBe(3)
    expect(parseThreshold(' 12 ')).toBe(12)
    for (const bad of ['0', '-1', '2.5', 'many']) expect(parseThreshold(bad)).toBe(5)
  })

  // Oldest by the date in the file name; ties by slug.
  test('oldest', () => {
    const list = [entry('2026-03-01-c.md', 'open'), entry('2026-01-01-b.md', 'open'), entry('2026-01-01-a.md', 'idea')]
    expect(oldest(list, 2).map((e) => e.name)).toEqual(['2026-01-01-a.md', '2026-01-01-b.md'])
  })

  // Startup: at most 5 files are named in all, problems first (they ask for
  // work); the rest are counted. Only the problems named count as told, so the
  // others are said again at their next change or check. The count line
  // appears from the threshold up (at the threshold included).
  test('startup notice', () => {
    const problems = Array.from({ length: 3 }, (_, i) => ({ label: `docs/issue/p${i}.md`, problems: ['category が無い'] }))
    const fixed = Array.from({ length: 4 }, (_, i) => ({ label: `docs/issue/f${i}.md`, fixes: ['status を直した'] }))
    const actives = Array.from({ length: 5 }, (_, i) => entry(`2026-01-0${i + 1}-a${i}.md`, 'open'))
    const r = startupNotice({ fixed, problems, isIndexUpdated: true, active: actives, threshold: 5 })
    expect((r.text ?? '').split('\n')).toEqual([
      'local-issue: 起動時に docs/issue を検査した。直した 4 件、直してほしい所がある 3 件 (直した分は作業コピーに未 commit の差分として残る)。',
      '- docs/issue/p0.md: 直してほしい: category が無い',
      '- docs/issue/p1.md: 直してほしい: category が無い',
      '- docs/issue/p2.md: 直してほしい: category が無い',
      '- docs/issue/f0.md: 直した: status を直した',
      '- docs/issue/f1.md: 直した: status を直した',
      '- ほか 2 件',
      'local-issue: docs/issue: INDEX.md を更新した',
      'local-issue: active な issue が 5 件ある。古い順: docs/issue/2026-01-01-a0.md (open)、docs/issue/2026-01-02-a1.md (open)、docs/issue/2026-01-03-a2.md (open)',
    ])
    expect(r.told).toEqual(['docs/issue/p0.md', 'docs/issue/p1.md', 'docs/issue/p2.md'])
    const many = Array.from({ length: 7 }, (_, i) => ({ label: `p${i}`, problems: ['x'] }))
    expect(startupNotice({ fixed: [], problems: many, isIndexUpdated: false, active: [], threshold: 5 }).told).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
    expect(startupNotice({ fixed: [], problems: [], isIndexUpdated: false, active: actives.slice(0, 4), threshold: 5 }).text).toBeUndefined()
  })
})
