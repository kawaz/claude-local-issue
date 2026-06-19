# 設計 (claude-local-issue)

> [English](./DESIGN.md) | 日本語

## ドメイン

本プラグインは claude-rules-personal の docs-knowledge-flow / docs-structure が定義する issue 運用の**発展形**。削除運用・5値 status を archive+DB モデル・7値へ発展させる(DR-0002)。プラグイン完成後に rules 側を本プラグイン前提へ改訂するまでが発展の完結(rules-revision-after-plugin issue)。

対象は kawaz リポ群の `docs/issue/`。GitHub flow のような厳密な issue 管理ではなく、docs-structure skill が定義する「一段ゆるい運用」(自リポ TODO + 他プロジェクトからの依頼受付 + セッション跨ぎメモ)を前提とする。

issue は **1 件 = 1 ファイル** (`docs/issue/YYYY-MM-DD-<slug>.md`)。状態は以下の軸を持つ:

- **status** (遷移する): `idea` / `open` / `wip` / `blocked` / `pending-sublimation` / `discarded`(方針・環境が変わり棄却) / `resolved`。意思で変わるので update の引数で明示
- **category** (分類): `idea` / `bug` / `request` / `design` / `task` / `tech-memo`。本文から導出できるので write/update 時にスキルが判定
- **時系列メタ** (スキルが記録): `created` / `last_read` / 各 `*-entered`(open/wip/blocked/pending/discarded/resolved の各到達時刻) / `*-reason`(discard/pending の理由) / `blocked_by`。全て **full ISO8601 + TZ**(`date -Iseconds`)。**mtime は使わない**(vcs 操作で mtime はあてにならず、read で mtime は変わらないため「読んでいるのに放置扱い」になる)
- **本文**

### category enum の根拠

kawaz の 7 リポの現存 + git 履歴から掘った約 68 件の issue を分類して確定した。`bug` / `request`(=feature) が実績最多、`design`(設計検討)が 12 件で当初候補から漏れていたため追加。`meta`(ルール/運用基盤の改善)は候補に挙がったが、宛先リポ(claude-rules-* 等)で既に分離されるため不採用。

## アーキテクチャ

### なぜスキルか (フックではなく)

issue の多段作業(起票・index 更新・commit)を command/skill に隔離することで、起票元コンテキストからその作業が消える。起票元は「リポ名・slug・本文を渡して 1 回呼ぶ」だけで、コンテキスト負荷は Write 1 回相当。フックで後追い矯正する案を採らない理由は DR-0001 の Alternatives Considered を参照。

副次効果:

- **低コスト**: 定型作業なので `model: haiku`。起票元が最上位 tier でも起票だけ安いモデルに落ちる
- **規約の隔離**: index・命名・ja/en・commit 作法は全てスキル内。起票元は覚えなくてよい
- **スコープの構造的固定**: スキルの入力が 1 件なので、index 全体スキャンや他 issue 巻き込みが起きない

### commands / skills / agent の使い分け

list/read は内容判定が軽く単一ファイルで完結するので `commands/`(ユーザ slash 第一意図)、write/update は category 判定・reason 正規化と template 参照が要るので `skills/`。command と skill は runtime 同一機構。**agent は不採用**: agent は別 system prompt の独立判断ワーカーで、issue CRUD のような定型フロー適用には過剰。隔離と低コストモデルは frontmatter の `model + context: fork + agent: general-purpose`(§9.2 recipe)で足り、agent ファイルは不要。

### context: fork の必要性

`model` 切替を `context: fork` なしで行うと、親 session の context が target model に持ち越され、window 超過で invocation 失敗(最悪メイン session が継続不能)になる実機事例がある(claude-plugin-reference skills.md §9.1)。fork で fresh context にすることで回避する。

### commit はパス限定・push しない

`bump-semver vcs commit -m ... <file> <INDEX.md>` を使う。指定パスの working-tree 内容だけを commit し、他の dirty な変更を巻き込まない・冪等(変更なしで no-op)。`-a/--all` は bump-semver 側が設計上拒否している。push は起票スキルの責務外(クロスプロジェクト起票では「相手リポにローカル記録が残る」までで十分、届ける判断は別レイヤ)。

## フック

- **PreToolUse** (matcher: Read/Write/Edit、`if` は使わない): 全 Read/Write/Edit で発火し、スクリプトが stdin のパスを見て `docs/issue/` 配下の issue なら対応スキルへ誘導。**非ブロック**(exit 0 + additionalContext)。
  - **`if` を使わない理由**: `if` はパフォーマンス用の前段フィルタに過ぎず、相対 glob が project dir 基準で解決されるため**クロスプロジェクト起票(絶対パス/別リポ)を取りこぼす**。本筋のブロック/無視/誘導の分岐はパスからスクリプトで行う方が確実。発火は増えるが、無関係パスは即 exit 0 するので実害なし
  - exit 2 でブロックしないのは、スキル本体も Read/Write/Edit を使うため。INDEX.md / README はスキルが正当に触るのでスクリプトが除外
- **SessionStart** (matcher `*`, `issue-count-nudge.sh`): 未解決 issue が閾値以上たまっていたら list を促す。該当なしなら無音。
  - **件数のみで判定し、stale 判定はしない**。stale は mtime では測れず frontmatter TS の max で測るべきもので、その算出は list に一元化する。nudge は「見にいくきっかけ」を作るだけ
  - **source で分岐**: `startup` / `clear` / `compact` のみ促す。`resume` は除外(コンテキストが生きたまま復帰し Ctrl-Z+fg 等で頻発するため)。matcher の alternation が source 値に効くかは未検証なので matcher は `*` でスクリプト側判定

放置・件数の閾値は env (`CLAUDE_LOCAL_ISSUE_STALE_DAYS` / `CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD`) で調整可。初期値は 14 日 / 5 件。

## close と archive

close は「やろうとしたことが done / 棄却された」時に打つ。**DR 化しただけでも close 可**だが、close_reason(`string[]`)に `dr/*` があり `implemented` が無ければ、DR 1 つにつき後続 issue「DR-XXXX を実装完了する」(task, 同一リポ)を close スキルが自動起票する。旧運用の「DR 化して安心して実装放置」を、close と後続起票の不可分連結で防ぐ。

close した issue は削除せず `docs/issue/archive/` へ物理移動する。直読みは hook でガードされ list はデフォルト archive を見ないので、メインコンテキストからは見えなくなる(=従来の削除と同じ効果)が、経緯(全 TS・reason)は DB として残る。archive は可視性の物理表現で、status とは直交。

## 未確定 (運用しながら詰める)

- 放置 → unread 戻しの厳密な日数
- SessionStart 促しの件数閾値
- リポ名 → ローカルパス解決の規約パス(`~/.local/share/repos/...`)の確定
