---
description: issue の status 変更 / 本文更新 / close (= archive 移動 + 未実装 DR の後続 issue 自動起票) を処理。AI が issue の状態を進める / 直す / 片付ける時に呼ぶ。詳細仕様は /local-issue:local-issue を参照。
model: sonnet
context: fork
agent: general-purpose
allowed-tools: Read, Write, Edit, Bash(bump-semver:*), Bash(rm:*), Bash(date:*), Bash(cat:*), Bash(ls:*), Bash(git rev-parse:*)
---

# update — issue 更新 / 解決

渡された 1 件だけを更新する。**他 issue・index 全体に触らない。**

## 入力

- **repo**: 対象リポ。省略時はカレントプロジェクト
- **slug** (or file): 対象 issue
- **status** (任意): 新しい status。idea/open/wip/blocked/pending-sublimation、`discarded`(棄却・要 discard_reason)、または `resolved`(= 解決・削除フロー)
- **reason** (任意): discarded / pending-sublimation / close 時の自由文。スキルが string[] に正規化して対応する *-reason / close_reason に記録
- **body-edit** (任意): 本文への変更内容
- **blocked_by** (任意): status=blocked 時の依存先

## status 変更フロー

status は `idea` / `open` / `wip` / `blocked` / `pending-sublimation` / `discarded` / `resolved`。
(`resolved` は下の解決フロー、`discarded` は方針・環境が変わり棄却する場合)

1. frontmatter の `status:` を新しい値に更新
2. **遷移 TS を記録**: 新しい status に対応する `<新status>-entered:` に今(`date -Iseconds`、full ISO8601 + TZ)を入れる(例: wip にするなら `wip_entered`)。同じ状態に再度入る往復は上書き(現状の割り切り。全履歴が要るようになったら JSON/SQLite へ移行し transitions 配列化する)
3. **reason が要る遷移**: `discarded` なら `discard_reason:`、`pending-sublimation` なら `pending_reason:` を必須記入。`blocked` なら `blocked_by:` を記入
4. category が本文変更で変わるなら再判定して `category:` も更新
5. INDEX.md の該当 1 行のみ更新(status と、必要なら category)
6. `bump-semver vcs commit -m "issue(<slug>): status <old> -> <new>" docs/issue/<file> docs/issue/INDEX.md`

**mtime には一切依存しない。時刻は全て frontmatter に明示記録する**(vcs 操作で mtime はあてにならないため)。

## 本文更新フロー

1. 該当 issue を Edit
2. 本文が実質変わり category が変わるなら `Category:` 再判定
3. INDEX.md の概要 1 行が古ければ更新
4. commit(パス限定)

## close (status=resolved / discarded) フロー

close は「この issue がやろうとしたことが実際に done になった/棄却された」時に打つ。
**DR 化しただけ・finding に残しただけ等は close してよい**(下記の後続起票で実装漏れを防ぐ)。

### 1. close_reason を正規化する(このスキルの中核)

呼び出し側はセクションレベルの自由文 md で「何をどこに落としたか」を渡してくる。
それを **1-line JSON array `string[]`** に正規化する(パス表現化・prefix 正規化・要約化):

- 昇華先ファイルパス → `dr/DR-0007` / `finding/<slug>` / `runbook/<topic>` / `journal/<date>-<slug>`
- 状態 → `implemented`(実装で解決済み) / `done`(task 系の単純完了) / `done:顧客に報告済み`(prefix + `:` + 自由補足)
- 棄却 → `discarded`(status=discarded 時)。理由は `discard_reason` 側に同形式で

例: `close_reason: ["dr/DR-0007","dr/DR-0008","finding/oklab-blend"]`

`discard_reason` / `pending_reason` も**同じ `string[]` 形式**(種別ごとに形式を変えない)。

### 2. 昇華先への退避(必要時のみ)

- 単純なコード修正のみ → 記録不要(close_reason に `done` 等)
- 設計判断 → `docs/decisions/DR-NNNN-...md`(decisions/INDEX 更新)
- 運用再発性 → `docs/runbooks/<topic>.md`
- 経緯 → `docs/journal/YYYY-MM-DD-<slug>.md`

### 3. 後続 issue の自動起票(実装漏れ防止の要)

close_reason を走査し、**`dr/*` 要素があり、かつ `implemented` が無い**場合、
その DR 要素**1 つにつき 1 件**、後続 issue を **同一リポに** `write` 経由で自動起票する:

- title: `DR-XXXX を実装完了する`
- category: `task`
- body: 元 issue の slug / 対象 DR のパス / DR の決定事項の要約 1-2 行(次に拾う人が DR を読みに行ける導線)

(`implemented` が付いていれば実装済みなので後続不要。DR 無し(finding/done のみ)なら実装対象が無いので後続不要)

### 4. 本文末尾の `## 解決時の記録先` セクション削除 (cmux-msg dogfood feedback (4) への対応)

旧形式 issue の本文末尾には起票時点で「将来解決時に何をどこに記録するか」を予測した `## 解決時の記録先` (or `## 解決時の昇華先` 等の類似名) セクションが残っていることがある。close 時には skill が `close_reason` を実際に生成するので **当該セクションは無意味なノイズ**になる (no-historical-noise rule)。

- 本文に `## 解決時の記録先` / `## 解決時の昇華先` 等の類似ヘッダで始まるセクションがあれば、そのセクション全体を削除
- 本文を Edit で書き換え

### 5. archive へ物理移動(削除しない)

- `resolved_entered` / `discarded_entered` に今(`date -Iseconds`)を記録、close_reason を frontmatter に書く
- `<root>/docs/issue/<file>` を **`<root>/docs/issue/archive/<file>` へ移動**(削除ではない)
  - 直読みは hook でガードされ、list はデフォルト archive を見ないので、メインコンテキストからは「見えなくなる」=従来の削除と同じ効果。経緯(全 TS・reason)は DB として残る
- INDEX.md から該当行を除去(active な index には載せない)

### 6. commit / 報告

- `bump-semver vcs commit -m "issue(close): <slug> -> archive" docs/issue/<file> docs/issue/archive/<file> docs/issue/INDEX.md <昇華先パス> <後続issueパス>`
  - 移動 = 旧パス削除 + 新パス追加。両方をパス指定に含める
- 報告: 「<slug> を close(status=<resolved/discarded>)。reason=<…>、archive へ移動、後続起票=<DR-XXXX 実装 issue / なし>、commit 済み」

## やらないこと

- push しない
- 他 issue を巻き込まない(自動起票する後続 issue は例外。これは close の一部)
- close 時にファイルを削除しない(archive へ移動して経緯を残す)
