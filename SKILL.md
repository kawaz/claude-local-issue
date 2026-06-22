---
name: local-issue
description: claude-local-issue plugin の全 sub-command (write/list/read/update/migrate) の用途・判断軸・入出力サマリ・設計指針。各 sub-command を呼ぶ前に「いつどれを使うか」「どんな引数を渡すか」が分からない時、frontmatter audience 区別 / migrate 必要性 / archive 運用 / クロスプロジェクト起票 の正本を確認したい時に読む。
model: haiku
context: fork
agent: general-purpose
allowed-tools: Read
---

# local-issue — docs/issue/ ローカル issue tracker plugin

各 kawaz リポの `docs/issue/` を「一段ゆるい運用 (= GH issue ほど厳格でない、本人 TODO + クロスプロジェクト依頼 + セッション間メモ)」で管理する command 群。issue CRUD・INDEX 保守・VCS commit をメインセッションの context から隔離する。

## 全 sub-command 一覧

| sub-command | 用途 | model | argument-hint |
|---|---|---|---|
| `/local-issue:list` | active issue を一覧 (放置日数順、フィルタ可) | haiku | `[--status <s>] [--category <c>] [--stale-days <n>] [--unread-only] [--include-archive] [--repo <name|path>]` |
| `/local-issue:read` | issue 1 件を読んで last_read 記録 + 次方針 TODO 化 | haiku | `<slug or file> [--repo <name|path>]` |
| `/local-issue:write` | issue 1 件を起票 (category 自動判定、INDEX 反映、path 限定 commit) | sonnet | `<repo (任意)> <slug> <body>` |
| `/local-issue:update` | issue の status 変更 / 本文更新 / close (archive 移動 + 後続 DR 起票) | sonnet | `<slug> [--status <s>] [--reason <r>] [--body-edit <body>] [--blocked-by <ref>] [--repo <name|path>]` |
| `/local-issue:migrate` | docs/issue/ 全体を frontmatter/INDEX 正本化 (bulk migration) | sonnet | `[--dry-run] [--repo <name|path>]` |

全 sub-command は **commands/<name>.md 配置 + 一般語命名**。namespace 衝突は補完 fuzzy match で吸収、実行時の解決は `/<plugin>:<name>` full namespace で明確。

## どれを使うか (判断軸)

- 「issue が全部で何件・何が放置されているか見たい」→ **list**
- 「特定の issue を読んで対応検討したい」→ **read** (last_read が記録される)
- 「気づいた点を issue として残したい」→ **write** (自リポ / クロスプロジェクトどちらも)
- 「issue の状態を進めたい / close して archive 送りしたい」→ **update**
- 「INDEX 不在 / frontmatter 欠落 / 旧 `- Status: open` 本文行が残ってる等の旧形式 issue がある」→ **migrate** (bulk normalization)

`list` 実行時に「frontmatter 不在 / 不完全」や「INDEX 不在」を検出したら、呼び出し側に **「`/local-issue:migrate` を実行しますか?」** を `AskUserQuestion` 等で促す (= list 自体は読み専、AskUserQuestion は親側で出す)。

## status enum (= transitions)

`idea` → `open` → `wip` → ( `blocked` | `pending-sublimation` | `resolved` | `discarded` )

| status | 意味 |
|---|---|
| `idea` | 投げ込み、まだ actionable でない |
| `open` | 未着手 |
| `wip` | 仕掛中、本文の `## TODO` checkbox で進捗を持つ |
| `blocked` | 依存待ち (`blocked_by:` 必須) |
| `pending-sublimation` | 実装は済んだが DR / runbook / journal への昇華待ち |
| `resolved` | 解決済 (= 実装完了)、archive 行き |
| `discarded` | 棄却 (= 前提消失、方針転換)、archive 行き |

`resolved` / `discarded` どちらも update skill が **close フロー** (時刻記録 + reason 正規化 + archive 移動 + 必要なら昇華先記録 + 未実装 DR の後続 issue 自動起票) を起動する。

## category enum (= classification)

`idea` / `bug` / `request` / `design` / `task` / `tech-memo`

本文から write/update が自動判定 (= sonnet 採用の理由)。判断に迷う時のみ本文末尾に `(category: <選択> — 要確認)` を付与。

## 設計指針

### 配置と命名 (= DR-0003)

- **ユーザ invocable な skill は全部 `commands/<name>.md` に一般語 (= 短縮形) で置く**
- namespace 衝突は補完 **fuzzy match** で吸収。実行時の解決は `/<plugin>:<name>` full namespace で明確
- 短縮形 (`/list` `/write`) を直打ちしても自前 command が候補に出る (他 plugin の同名 command と並ぶだけで実害なし)
- 命名: list / read / write / update / migrate (各 1 動詞、責務明確)

### frontmatter audience の区別

| field / 場所 | audience | 用途 | 書き方 |
|---|---|---|---|
| `description` | **AI** | command 発見 / 自動 invoke trigger / listing 常時 context | 「何 + いつ呼ぶか」1-2 文 |
| `argument-hint` | **ユーザ** | 補完中スペース後にグレーで `[...]` 表示、1 文字打つと消える | 引数の選択肢を 1 行、人間が読んで打つ材料 |
| 本文 (`---` 以下) | **AI** (invoke 時のみ) | standing instructions、固定フロー | 入力 / 固定フロー / やらないこと / 報告 |
| 本 SKILL.md (= `/local-issue:local-issue`) | **AI** | 全体ガイドの entry point、判断軸の正本 | 詳細仕様の集約、各 sub-command の short description を補完 |

→ description で AI 向けとユーザ向けを混在させない。長文 description は listing context を圧迫しつつ補完で読みにくい。

### supporting files

- `${CLAUDE_PLUGIN_ROOT}/templates/issue.md` — write/migrate が新 issue 起票時の雛形
- `${CLAUDE_PLUGIN_ROOT}/templates/index.md` — migrate が INDEX 再生成時の雛形

### archive 運用

close した issue は `docs/issue/archive/` へ **物理移動** (削除ではない、経緯 DB として残す)。read で archive を直接指定された時は last_read 更新と commit はスキップして報告のみ。list はデフォルト archive を見ない (`--include-archive` で含む)。

### path 規約

- リポ名 指定時の解決: `~/.local/share/repos/github.com/kawaz/<name>/main` (kawaz リポ規約)
- 絶対パス指定は無条件採用
- 省略時は `$CLAUDE_PROJECT_DIR`
- `cd <root> && bump-semver vcs get root` で正規化 (= git/jj 両対応の VCS root 取得 API)

### 時刻表記

frontmatter の全 TS フィールドは **full ISO8601 + TZ** (`date -Iseconds`、例 `2026-06-19T17:30:00+09:00`)。mtime は使わない (= vcs 操作で当てにならない + read で mtime が変わると「読んだのに古いと nudge される」事故)。

### reason の string[] 正規化

`close_reason` / `discard_reason` / `pending_reason` は同じ `string[]` 形式。各要素は `<prefix>` または `<prefix>:<自由補足>`:

- 昇華先パス → `dr/DR-0007` / `finding/<slug>` / `runbook/<topic>` / `journal/<date>-<slug>`
- 状態 → `implemented` (実装で解決済み) / `done` (task 系の単純完了) / `done:顧客に報告済み` (prefix + `:` + 補足)
- 棄却 → `discarded` (= status=discarded 時)

例: `close_reason: ["dr/DR-0007","dr/DR-0008","finding/oklab-blend"]`

### 後続 issue 自動起票 (= DR-0002)

update skill の close フローで `close_reason` を走査し、**`dr/*` 要素があり、かつ `implemented` が無い**場合、その DR 要素 1 つにつき 1 件、後続 issue を **同一リポに** write 経由で自動起票する (= 設計判断は記録したが実装が漏れる事故を防ぐ)。

## クロスプロジェクト起票

- write は repo 引数で他リポの `docs/issue/` に起票できる (= 非同期メッセージ)
- 起票 = ローカル commit までで完了、push は **write の責務外** (= 別レイヤ)
- 当事者リポへの起票時は **「フラグ止まりスタンス」** で当事者判断を尊重 (dogfooding-feedback-upstream rule)
- 起票元の経緯・自分の読解依拠の偏りも本文に明記 (= 当事者が判断する材料を提供)

## 関連 DR

- [DR-0001](docs/decisions/DR-0001-skill-over-hook-isolation.md) — issue 操作を command/skill に隔離する (commands 統一は DR-0003 で再判断)
- [DR-0002](docs/decisions/DR-0002-db-model-supersedes-delete-flow.md) — 削除運用を archive + DB モデルへ、status/category enum 確定
- DR-0003 — commands 配置統一 + plugin root SKILL.md + migrate 新設 + frontmatter audience 区別 (= 本ガイドの設計指針の正本)
