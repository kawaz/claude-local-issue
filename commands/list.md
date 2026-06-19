---
description: ローカル issue 一覧を整理して返す。docs/issue/ 配下の active issue を slug / category / status / 放置期間(frontmatter TS の max からの経過)で集計・ソートして返す。フィルタ(status / category / 放置日数 / archive 含む)可。読むだけで丸め直しはしない。AI が「今どの issue がどの状態か」「溜まっている issue はどれか」を確認する時、ユーザが /local-issue:list で一覧したい時に使う。
argument-hint: '[--status <s>] [--category <c>] [--stale-days <n>] [--unread-only] [--include-archive] [--repo <name|path>]'
model: haiku
context: fork
agent: general-purpose
allowed-tools: Read, Bash(ls:*), Bash(cat:*), Bash(grep:*), Bash(date:*), Bash(git rev-parse:*)
---

# list — ローカル issue 一覧

docs/issue/ 配下の active issue を一覧する。**読むだけ。** frontmatter / INDEX.md / ファイルを書き換えない。

## 入力 ($ARGUMENTS)

- `--status <s>` — status フィルタ。複数値はカンマ区切り (例: `--status open,wip`)。enum: `idea` / `open` / `wip` / `blocked` / `pending-sublimation`
- `--category <c>` — category フィルタ。複数値はカンマ区切り。enum: `idea` / `bug` / `request` / `design` / `task` / `tech-memo`
- `--stale-days <n>` — 放置日数 n 日以上のみ
- `--unread-only` — `last_read` が空、または `--stale-days` 指定時はその日数を超えるもののみ
- `--include-archive` — `docs/issue/archive/` 配下も含める。デフォルトは active のみ
- `--repo <name|path>` — 対象リポ。リポ名なら `~/.local/share/repos/github.com/kawaz/<name>/main` 規約で解決。省略時は `$CLAUDE_PROJECT_DIR`

## 固定フロー (順に実行、逸脱しない)

1. **対象 root を確定**
   - `--repo` 引数があれば解決(リポ名なら規約パス、絶対パスならそのまま)、無ければ `$CLAUDE_PROJECT_DIR`
   - `cd <root> && git rev-parse --show-toplevel` で正規化(解決できなければ「<root> は git リポではない」を報告して終了)

2. **走査対象を列挙**
   - `<root>/docs/issue/*.md` から `INDEX.md` と `README*.md` を除外
   - `--include-archive` 時は `<root>/docs/issue/archive/*.md` も追加

3. **各 file の frontmatter を抽出** (`Read` で frontmatter + 本文 1 行目だけ)
   - 必須: `status`, `category`, `created`, `last_read`, `open_entered`, `wip_entered`, `blocked_entered`, `pending_entered`, `resolved_entered`, `discarded_entered`, `blocked_by`
   - 本文の最初の `# <title>` 行を「概要」として 80 文字まで切り出す(無ければ frontmatter `title`、それも無ければ slug)

4. **放置日数を計算**
   - 各 issue について `max(created, last_read, open_entered, wip_entered, blocked_entered, pending_entered, resolved_entered, discarded_entered)` の最大 ISO8601 を採用
   - 現在時刻(`date -Iseconds`)との差を整数日に丸める
   - frontmatter TS が全て空の異常 issue は「不明」として最後尾に

5. **フィルタ適用**
   - `--status` / `--category` / `--stale-days` / `--unread-only` / `--include-archive` をすべて AND で適用
   - 該当 0 件なら「該当 issue なし」を 1 行で報告して終了 (= step 7 をスキップ)

6. **ソート**: 放置日数の降順(古いものほど上)。同値は `created` 昇順で安定化

7. **Markdown 表で報告**
   ```
   | slug | category | status | 放置日数 | last_read | 概要 |
   |---|---|---|---|---|---|
   | ... | ... | ... | 12 日 | 2026-06-15 | ... |
   ```
   - `last_read` は ISO8601 を日付部分のみ。未読は `-`
   - `放置日数` は整数 + ` 日`、不明時は `?`

## やらないこと

- frontmatter / 本文 / INDEX.md を一切書き換えない (= 読み専)
- `bump-semver vcs commit` しない
- ファイル削除 / archive 移動 / 状態遷移を一切起こさない
- 引数が無い / 不正な場合でも上記フローをそのまま回す(無指定 = 全 active を放置日数降順で表示が default 挙動)

## 報告フォーマット

```
<root>/docs/issue/ から N 件 (filter: status=..., category=..., stale-days=..., unread-only=..., include-archive=...)、ソート: 放置日数降順

| slug | category | status | 放置日数 | last_read | 概要 |
|---|---|---|---|---|---|
...
```

0 件なら表は省略し「該当 issue なし」のみ。
