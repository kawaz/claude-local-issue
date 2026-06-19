---
description: issue の status 変更 / 本文更新 / close (= archive 移動 + 未実装 DR の後続 issue 自動起票) を処理。AI が issue の状態を進める / 直す / 片付ける時に呼ぶ。詳細仕様は /local-issue:local-issue を参照。
argument-hint: '<slug> [--status <s>] [--reason <r>] [--body-edit <body>] [--blocked-by <ref>] [--repo <name|path>]'
model: sonnet
context: fork
agent: general-purpose
allowed-tools: Read, Write, Edit, Grep, Bash(bump-semver:*), Bash(cp:*), Bash(rm:*), Bash(date:*), Bash(cat:*), Bash(ls:*), Bash(grep:*), Bash(git rev-parse:*)
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

1. **対象フレーズの出現箇所を事前 grep** (= DR-0005 Q5): body-edit の指示で「X を Y に置換」「X に Z 追記」等の操作が出てきた時、まず `Grep` ツール (or `Bash(grep:*)`) で X の出現箇所を全て確認する。親 AI が「2 箇所」と書いていても実際 5 箇所あることがある (= 9cell-trial で実証された取りこぼしパターン)
2. **Edit を優先、Write 全文再書き込みは回避** (= DR-0005 Q2): 全置換は `Edit` の `replace_all: true` を優先。Write での全文再書き込みは大ファイルでコスト増 + 転記ミスリスクがあるため避ける。複数箇所の独立した変更も Edit を複数回呼ぶ
3. 該当 issue を Edit
4. 本文が実質変わり category が変わるなら `category:` 再判定
5. INDEX.md の概要 1 行が古ければ更新
6. commit(パス限定)

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
- **移動は `cp` + `rm` で明示分割** (= 旧 path の delete を vcs に明確に伝えるため、`mv` を使わない):
  1. `cp <root>/docs/issue/<file> <root>/docs/issue/archive/<file>` (= 新 path 作成)
  2. `rm <root>/docs/issue/<file>` (= 旧 path 削除、vcs view からも消える)
- INDEX.md から該当行を除去(active な index には載せない)
  - 直読みは hook でガードされ、list はデフォルト archive を見ないので、メインコンテキストからは「見えなくなる」=従来の削除と同じ効果。経緯(全 TS・reason)は DB として残る

### 6. commit / 報告

**重要**: `bump-semver vcs commit PATH..` は spec 上 **「nonexistent path は silently dropped」** で、`mv` 後の旧 path を指定しても delete が commit に含まれない (= 後続 commit に unstaged delete として漏れる bug、v0.2.0-v0.2.2 で 3 回再現)。回避のため **`--staged` モード**を使う:

- 事前確認 (Step 0 相当): close 開始時に `docs/issue/` 以外の dirty 変更がないことを確認 (= 巻き込み防止):
  ```
  cd <root>
  bump-semver vcs is clean docs/issue/  # docs/issue/ 配下のみ dirty なら OK の意
  # 不整合があれば「他に dirty 変更あり、close を中断」報告して終了
  ```
- commit:
  ```
  cd <root>
  bump-semver vcs commit --staged -m "issue(close): <slug> -> archive"
  ```
  - `--staged` は git の場合は index、jj の場合は @ snapshot 全体。docs/issue/ 配下しか触っていないことが事前確認済みなら、cp/rm/INDEX 更新/昇華先/後続 issue が全部 1 commit に入る
  - 後続 issue 起票 (Step 3) が別 commit で先に行われる場合、close commit と分離して構わない (= bump-semver vcs commit を 2 度叩く)
- 報告: 「<slug> を close(status=<resolved/discarded>)。reason=<…>、archive へ移動、後続起票=<DR-XXXX 実装 issue / なし>、commit 済み」

## やらないこと

- push しない
- 他 issue を巻き込まない(自動起票する後続 issue は例外。これは close の一部)
- close 時にファイルを削除しない(archive へ移動して経緯を残す)
