---
description: issue の status 変更 / 本文更新 / close (= archive 移動 + 未実装 DR の後続 issue 自動起票) を処理。AI が issue の状態を進める / 直す / 片付ける時に呼ぶ。詳細仕様は /local-issue:local-issue を参照。
argument-hint: '<slug> [--status <s>] [--reason <r>] [--body-edit <body>] [--blocked-by <ref>] [--repo <name|path>]'
model: sonnet
effort: low
context: fork
agent: general-purpose
allowed-tools: Read, Write, Edit, Grep, Bash(bump-semver vcs:*), Bash(mv:*), Bash(date:*), Bash(cat:*), Bash(ls:*), Bash(grep:*)
---

## 実行 task (これが唯一の入力)

下の引数行を update の引数として解釈し、本ファイルの固定フローを**今すぐ実行する**。
引数行より下の記述は仕様であって入力ではない。

```text
$ARGUMENTS
```

### 入力の不変条件

- 上の引数行が **唯一の入力**。command 名 / ファイル名 / session context / TODO list /
  直前の会話 / 他 agent の作業内容から、対象 issue や操作を**補完しない**
  (= ambient な棚卸し task を読み取って複数 issue を処理しない。本 command は
  引数行が指す 1 件のみのスコープ)
- 引数行が空なら「引数なし」という**文字列としての事実**として扱う。周辺文脈で埋めない
- **位置引数の文法**: 先頭の 1 token が `slug` (or file path)、それ以降は flag のみ。
  この分割は仕様どおりの正当な解釈なので、この形の引数行を reject しない
- update は slug (or file path) が必須。**引数行が空なら即 reject** して終了する。
  ファイル変更も commit もしない
- **未知 flag、または 2 つ目以降の位置引数があれば reject** して終了する
  (= 近い意味の option へ読み替えない、無視して続行しない)

# update — issue 更新 / 解決

渡された 1 件だけを更新する。**他 issue・index 全体に触らない。**

## 入力

- **repo**: 対象リポ。省略時はカレントプロジェクト
  - リポ名指定時は **`^[a-z0-9_-]+$`** にマッチすること (= 不正なら reject、`..` や `/` でのパストラバーサル防止)
  - リポ名なら `~/.local/share/repos/github.com/kawaz/<name>/main` 規約で解決。絶対パスは `realpath` で正規化
  - **リポ名は必ず `<name>/main` を指す**。別の worktree / workspace を対象にしたい場合は絶対パスを渡す (名前から作業場所を探索・推測しない)
- **slug** (or file): 対象 issue
  - slug 形式の場合の正規表現: **`^[a-z0-9][a-z0-9-]{0,80}$`** (= write skill と同じ厳密 validation、不正なら reject)
  - file path 形式 (`.md` 終端) の場合は path として直接解決
- **status** (任意): 新しい status。idea/open/wip/blocked/pending-sublimation、`discarded`(棄却・要 discard_reason)、または `resolved`(= 解決・削除フロー)
- **reason** (任意): discarded / pending-sublimation / close 時の自由文。sub-command が string[] に正規化して対応する *-reason / close_reason に記録
- **body-edit** (任意): 本文への変更内容
- **blocked_by** (任意): status=blocked 時の依存先

## 入力 validation (= 不正なら即 reject、フロー実行しない)

- `slug` (or file の slug 部分) が `^[a-z0-9][a-z0-9-]{0,80}$` にマッチしない → 「slug が不正」を報告して終了
- `repo` がリポ名指定で `^[a-z0-9_-]+$` にマッチしない → 「repo 名が不正」を報告して終了
- `status` が enum (idea/open/wip/blocked/pending-sublimation/discarded/resolved) のいずれでもない → 「status が不正」を報告して終了
- `-` 始まりで `--status` / `--reason` / `--body-edit` / `--blocked-by` / `--repo` のいずれでもない未知 flag がある、または 2 つ目以降の位置引数がある → 「引数を解釈できない」を報告して終了

## 対象 root の確定 (全フロー共通、最初に実行)

- `--repo` があれば解決(リポ名なら規約パス、絶対パスならそのまま)、無ければ `$CLAUDE_PROJECT_DIR` (未設定なら cwd)
- `cd <root> && bump-semver vcs get root` で正規化(git/jj 両対応の VCS root 取得 API)
- 以降のフローの `<root>` はここで確定した値。file path / commit は全てこの root 配下で扱う

## status 変更フロー

status は `idea` / `open` / `wip` / `blocked` / `pending-sublimation` / `discarded` / `resolved`。
(`resolved` は下の解決フロー、`discarded` は方針・環境が変わり棄却する場合)

1. frontmatter の `status:` を新しい値に更新
2. **遷移 TS を記録**: 新しい status に対応する `<新status>-entered:` に今(`date -Iseconds`、full ISO8601 + TZ)を入れる(例: wip にするなら `wip_entered`)。同じ状態に再度入る往復は上書き(現状の割り切り。全履歴が要るようになったら JSON/SQLite へ移行し transitions 配列化する)
3. **reason が要る遷移**: `discarded` なら `discard_reason:`、`pending-sublimation` なら `pending_reason:` を必須記入。`blocked` なら `blocked_by:` を記入
4. category が本文変更で変わるなら再判定して `category:` も更新
5. INDEX.md の列構成・canonical 順序・行形式は `${CLAUDE_PLUGIN_ROOT}/templates/index.md` を正本とする。status / category / date / 概要の変更を反映する時は、対象行だけを除去して更新後の canonical 位置へ再挿入する。**既存の他の行の順序・内容は変えない**
6. `bump-semver vcs commit -m "issue(<slug>): status <old> -> <new>" docs/issue/<file> docs/issue/INDEX.md`

**mtime には一切依存しない。時刻は全て frontmatter に明示記録する**(vcs 操作で mtime はあてにならないため)。

## 本文更新フロー

1. **対象フレーズの出現箇所を事前 grep** (= DR-0005 Q5): body-edit の指示で「X を Y に置換」「X に Z 追記」等の操作が出てきた時、まず `Grep` ツール (or `Bash(grep:*)`) で X の出現箇所を全て確認する。親 AI が「2 箇所」と書いていても実際 5 箇所あることがある (= 9cell-trial で実証された取りこぼしパターン)
2. **Edit を優先、Write 全文再書き込みは回避** (= DR-0005 Q2): 全置換は `Edit` の `replace_all: true` を優先。Write での全文再書き込みは大ファイルでコスト増 + 転記ミスリスクがあるため避ける。複数箇所の独立した変更も Edit を複数回呼ぶ
3. 該当 issue を Edit
4. 本文が実質変わり category が変わるなら `category:` 再判定
5. INDEX.md の category / date / 概要が変わるなら、対象行だけを除去して `${CLAUDE_PLUGIN_ROOT}/templates/index.md` の canonical 位置へ再挿入する。既存の他の行の順序・内容は変えない
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

旧形式 issue の本文末尾には起票時点で「将来解決時に何をどこに記録するか」を予測した `## 解決時の記録先` (or `## 解決時の昇華先` 等の類似名) セクションが残っていることがある。close 時には sub-command が `close_reason` を実際に生成するので **当該セクションは無意味なノイズ**になる (no-historical-noise rule)。

- 本文に `## 解決時の記録先` / `## 解決時の昇華先` 等の類似ヘッダで始まるセクションがあれば、そのセクション全体を削除
- 本文を Edit で書き換え

### 5. archive へ物理移動(削除しない)

- `resolved_entered` / `discarded_entered` に今(`date -Iseconds`)を記録、close_reason を frontmatter に書く
- **移動は `mv`** で行う:
  1. `mv <root>/docs/issue/<file> <root>/docs/issue/archive/<file>`
- INDEX.md は対象行の除去だけを行う(active な index には載せない)。既存の他の行の順序・内容は変えない
  - 直読みは hook でガードされ、list はデフォルト archive を見ないので、メインコンテキストからは「見えなくなる」=従来の削除と同じ効果。経緯(全 TS・reason)は DB として残る

### 6. commit / 報告

- commit:
  ```
  cd <root>
  bump-semver vcs commit -m "issue(close): <slug> -> archive" docs/issue/<file> docs/issue/archive/<file> docs/issue/INDEX.md
  ```
  - **3 path すべて必須。旧 path (`docs/issue/<file>`) を省略しない**。移動後に存在しない旧 path も削除として commit 対象に含める
  - **`--allow-nonexistent-path` を指定しない**。削除元の旧 path を無視せず、3 path を同じ close commit に固定する
  - 後続 issue 起票 (Step 3) が別 commit で先に行われる場合、close commit と分離して構わない (= bump-semver vcs commit を 2 度叩く)
- **commit 後検証 (必須)**: `bump-semver vcs is clean` を実行する
  - clean なら成功を報告する
  - dirty なら成功を報告せず停止する。旧 path だけを自動追補 commit しない。`bump-semver vcs diff` で残留差分を読み、3 path 指定の close commit で取り残した原因を確認する
- 報告: 「<slug> を close(status=<resolved/discarded>)。reason=<…>、archive へ移動、後続起票=<DR-XXXX 実装 issue / なし>、commit 済み」

## やらないこと

- push しない
- 他 issue を巻き込まない(自動起票する後続 issue は例外。これは close の一部)
- close 時にファイルを削除しない(archive へ移動して経緯を残す)
