---
description: issue 1 件を起票 (category 自動判定、INDEX 反映、path 限定 commit、push なし、クロスプロジェクト対応)。AI が気づいた点を担当プロジェクトの issue として残したい時に呼ぶ。詳細仕様は /local-issue:local-issue を参照。
argument-hint: '<slug> <body> [--repo <name|path>] [--status <s>] [--origin <ref>]'
model: sonnet
effort: low
context: fork
agent: general-purpose
allowed-tools: Read, Write, Edit, Bash(bump-semver vcs:*), Bash(date:*), Bash(ls:*), Bash(cat:*)
---

# write — ローカル issue 起票

渡された 1 件の起票だけを処理する。**他の issue や index 全体には触らない。**

## 入力

- **repo**: 起票先リポ(名 or 絶対パス)。省略時はカレントプロジェクト
  - リポ名指定時は **`^[a-z0-9_-]+$`** にマッチすること (= 不正なら reject、`..` や `/` でのパストラバーサル防止)
  - 絶対パスは `realpath` で正規化
- **slug**: ファイル名に使う slug
  - 正規表現: **`^[a-z0-9][a-z0-9-]{0,80}$`** (= 英小文字始まり + 英数字とハイフン、最大 81 文字)
  - **不正な slug は reject し、ファイル生成も commit もしない** (= path traversal / 空 slug / 大文字混入 / 特殊文字 / 過長を全て弾く)
- **body**: issue 本文(自然文。概要・背景など)
- **status** (任意, default `open`): idea / open / wip / blocked / pending-sublimation
- **origin** (任意): 自リポ TODO か、依頼元プロジェクト名か

## 固定フロー (順に実行、逸脱しない)

0. **引数 validation** (= 不正なら即 reject、step 1 以降に進まない)
   - `slug` が `^[a-z0-9][a-z0-9-]{0,80}$` にマッチしない → 「slug が不正 (= 英小文字始まり + 英数字/ハイフン、最大 81 文字)」を報告して終了
   - `repo` がリポ名指定で `^[a-z0-9_-]+$` にマッチしない → 「repo 名が不正」を報告して終了
   - `body` が空文字列 → 「body が空」を報告して終了

1. **起票先リポ root を確定**
   - repo が絶対パスならそれ (= `realpath` で正規化)。リポ名なら `~/.local/share/repos/github.com/kawaz/<name>/main` 等の規約パスを解決(存在確認)。省略時は `$CLAUDE_PROJECT_DIR`
   - `bump-semver vcs get root`(対象ディレクトリで実行)で root を正規化(git/jj 両対応の VCS root 取得 API)

2. **category を判定** (本文から、下記 enum のいずれか 1 つ)
   - `idea` — 投げ込み・思いつき・要検討の種
   - `bug` — 不具合・誤動作・失敗
   - `request` — 機能要望・新規 API・新規コマンド
   - `design` — 設計・アーキ検討・トレードオフ議論(実装前の検討)
   - `task` — 移行・片付け・リファクタ・運用作業
   - `tech-memo` — 調査・検証・知見の記録
   - 判断に迷う場合のみ、最も近い 1 つを選び本文末尾に `(category: <選択> — 要確認)` と添える

3. **ファイル生成**: `<root>/docs/issue/<YYYY-MM-DD>-<slug>.md`
   - ファイル名の日付は `date +%Y-%m-%d`
   - frontmatter の時刻は **full ISO8601 + TZ**(`date -Iseconds`、例 `2026-06-18T10:00:00+09:00`)。日付のみ・TZ なしは使わない
   - `created` と `open_entered`(status=open 起票時)に同じ ISO8601 を入れる。status を idea で起票するなら `open_entered` は空のまま
   - テンプレは `${CLAUDE_PLUGIN_ROOT}/templates/issue.md` を読んで使う(本文に埋まったこの絶対パスは command 起動時に展開済みで fork 先 subagent にも渡るため、`context: fork` 下でも Read できる)。**全 TS フィールドは full ISO8601、未到達の状態の `*-entered` は空**

4. **issue index にこの 1 件のみ反映**
   - `<root>/docs/issue/INDEX.md` があれば、この 1 件のエントリ行を追加(既存 slug なら該当行のみ更新)。**他の行は読み取り以外で触らない**
   - INDEX.md が無ければ docs-structure 規約に従い新規作成し、この 1 件だけを載せる
   - エントリ形式: `| <date> | <category> | <status> | [<slug>](./<file>) | <概要 1 行> |`

5. **ローカル commit (push しない)**
   - `cd <root> && bump-semver vcs commit -m "issue(<category>): <slug>" docs/issue/<file> docs/issue/INDEX.md`
   - パス限定なので他の dirty な変更を巻き込まない。冪等(変更なしなら no-op)

6. **報告**: 「`<root>` に `<file>` を起票(category=<…>, status=<…>)、index 反映、ローカル commit 済み。push はしていない」を 1-2 行で

## クロスプロジェクト起票の注記

起票先 root != `$CLAUDE_PROJECT_DIR` の場合、これは相手リポへの非同期メッセージ。
commit までで「相手リポに記録が残る」状態になる(push の判断はこのスキルの責務外)。

## やらないこと

- push しない
- 他 issue の棚卸し・整合チェックをしない(このスキルは 1 件スコープ)
- index 全体の再生成をしない
