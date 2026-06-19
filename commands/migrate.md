---
description: docs/issue/ 全体を frontmatter/INDEX 正本化する bulk migration (旧形式吸収、category 自動判定、INDEX 再生成、まとめて commit)。AI が「frontmatter 欠落」「INDEX 不在」「本文行で status を持つ」等の旧形式 issue を発見した時に呼ぶ。詳細仕様は /local-issue:local-issue を参照。
argument-hint: '[--dry-run] [--repo <name|path>]'
model: sonnet
context: fork
agent: general-purpose
allowed-tools: Read, Write, Edit, Bash(bump-semver:*), Bash(git rev-parse:*), Bash(git log:*), Bash(date:*), Bash(ls:*), Bash(cat:*), Bash(find:*), Bash(grep:*)
---

# migrate — docs/issue/ 全体の正本化 (bulk migration)

旧形式 issue (frontmatter 欠落 / 本文行で status を持つ / INDEX 不在 等) を新形式 (= write skill が生成する形) へ揃える。**1 件ごとではなく全体走査**。

## 入力 ($ARGUMENTS)

- `--dry-run` (任意): 走査と差分提示のみ、ファイル変更 / commit しない (= 適用前の確認用)
- `--repo <name|path>` (任意): 対象リポ。リポ名なら `~/.local/share/repos/github.com/kawaz/<name>/main` 規約。省略時は `$CLAUDE_PROJECT_DIR`

## 固定フロー (順に実行、逸脱しない)

### 1. 対象 root を確定

- `--repo` があれば解決、無ければ `$CLAUDE_PROJECT_DIR`
- `cd <root> && git rev-parse --show-toplevel` で正規化
- `<root>/docs/issue/` が存在しなければ「docs/issue/ がない、migrate 対象なし」を報告して終了

### 2. 走査対象を列挙

- `<root>/docs/issue/*.md` (INDEX.md / README* は除外)
- archive 配下 (`<root>/docs/issue/archive/*.md`) は **対象外** (= 過去の経緯を改変しない、close 済を再 normalize しない)

### 3. 各 file を判定・補完

各 file について以下を順に評価:

#### 3.1 frontmatter の有無

- 先頭が `---\n` で始まらないなら **frontmatter 欠落** とみなし、新規 frontmatter を `${CLAUDE_PLUGIN_ROOT}/templates/issue.md` を雛形に追加
- ある場合は既存 frontmatter を保持しつつ欠落フィールドのみ補完

#### 3.2 必須フィールドの補完

| field | 補完ロジック |
|---|---|
| `title` | 本文先頭の `# <title>` 行から、無ければ slug |
| `status` | 既存値、無ければ本文行 `- Status: <s>` から吸収、それも無ければ `open` |
| `category` | 既存値、無ければ本文から自動判定 (idea/bug/request/design/task/tech-memo) |
| `created` | 既存値、無ければ本文行 `- Date: <date>` から吸収、それも無ければ `git log --diff-filter=A --format=%aI -- <file>` (= 初回追加 commit 日時)、それも無ければ `date -Iseconds` |
| `last_read` | 既存値、無ければ空のまま |
| `open_entered` | status=open なら `created` と同値、status が他状態なら空 |
| `*_entered` (wip/blocked/pending/discarded/resolved) | 既存値のみ保持、空欄補完しない (= 状態遷移実績がないものを偽造しない) |
| `blocked_by` | status=blocked かつ本文に「待ち」「依存」言及があれば抜粋して入れる、無ければ空 |
| `origin` | 既存値、無ければ本文行 `- 発見元: <x>` から吸収、それも無ければ空 |
| `discard_reason` / `pending_reason` / `close_reason` | 既存値のみ保持 (= 1-line JSON array string[] 形式が壊れているなら正規化) |

#### 3.3 本文行の frontmatter 吸収

本文中の以下のような旧形式行を **frontmatter に吸収して本文から削除**:

- `- Status: <s>` / `- status: <s>` → frontmatter `status`
- `- Date: <date>` / `- 起票: <date>` → frontmatter `created`
- `- Priority: <p>` → **frontmatter に吸収せず本文残置** (= DR-0003 で priority field を採用しない方針、Priority 概念は放置日数で代替)
- `- 発見元: <x>` / `- origin: <x>` → frontmatter `origin`

#### 3.4 no-historical-noise コメントの削除

本文中の以下のような過渡期コメントを削除:

- 「Will be sublimated after DR-XXXX land」「DR-XXXX で前提解消したら削除」等の予告
- 「以前は X だったが今は Y」「(v0.X で確認)」等の history narrative
- 削除対象は kawaz の `no-historical-noise` rule に従う

### 4. INDEX.md を再生成

走査後の active issue 全件から `<root>/docs/issue/INDEX.md` を **再生成**:

- 雛形は `${CLAUDE_PLUGIN_ROOT}/templates/index.md` (= 列構成 / ソート規約の正本)
- 既存 INDEX.md があれば内容を破棄、雛形ベースで新規作成
- 列: `| date | category | status | slug | 概要 |` (= local-issue 標準)
- ソート: status (idea→open→wip→blocked→pending-sublimation) 優先、同 status 内は date 降順

### 5. bulk commit (`--dry-run` 時はスキップ)

- 変更が 0 件なら no-op で終了
- 1 件以上なら `cd <root> && bump-semver vcs commit -m "issue(migrate): N files normalized" docs/issue/<changed-files...> docs/issue/INDEX.md`
- パス限定なので docs/issue/ 外の dirty 変更は巻き込まない

### 6. 報告

```
<root>/docs/issue/ を migrate (N files normalized, INDEX 再生成)

| file | 変更内容 |
|---|---|
| 2026-06-11-foo.md | frontmatter 新規追加 (status=idea, category=idea) |
| 2026-06-11-bar.md | 本文行 `- Status:` → frontmatter 吸収 |
...

commit: <hash> "issue(migrate): N files normalized"
```

`--dry-run` 時は最後の commit 行を「(--dry-run: ファイル変更なし)」に置換。

## やらないこと

- archive 配下を触らない (= 過去経緯を改変しない)
- 1 件単位で起票しない (= write の責務、migrate は bulk のみ)
- status 遷移を勝手に起こさない (= migrate は形式正本化、状態遷移は update の責務)
- close 系処理 (archive 移動 / 後続 DR 起票) しない (= update の責務)
- push しない

## 関連

- 全体ガイド: `/local-issue:local-issue`
- write (1 件起票): `/local-issue:write`
- list (走査 + frontmatter 欠落検出時の migrate 提案): `/local-issue:list`
