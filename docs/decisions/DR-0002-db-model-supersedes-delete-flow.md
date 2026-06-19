# DR-0002: 削除運用を archive+DB モデルへ発展させ、status/category enum を確定する

- Status: Active
- Date: 2026-06-18

## Context

### 出自

本プラグインは、claude-rules-personal の issue 回し運用 (docs-knowledge-flow / docs-structure で定義された、`docs/issue/` ベースの「一段ゆるい」TODO + 依頼受付 + セッション跨ぎメモ運用) を、独立プラグインとして**発展させる**目的で設計された。以下はその発展に伴って source 側の運用をどう改訂するかの判断であり、ゼロからの新設計ではなく既存運用の延長線上にある。

### 発展の中身

claude-rules-personal の docs-knowledge-flow / docs-structure は、issue を解決時に削除する運用と 5 値 status (idea / open / wip / blocked / pending-sublimation) を定義している。削除運用は「コンテキスト汚染を避ける」目的だったが、直読みを hook でガードし list がデフォルトで archive を見ない仕組み(DR-0001)が入ると、その目的は archive への移動でも達成できる。archive は通常コンテキストからは見えず実質「ほぼ削除」だが、削除と違いファイルとして履歴に残る (= 削除運用の目的を損なわず、grep 発見性だけ上回る上位互換)。経緯(全 TS・reason)を捨てる必要がなくなる。

## Decision

このプラグインは docs-knowledge-flow / docs-structure の削除運用モデルを **supersede し、archive + DB モデルへ発展させる**:

- close 時は削除でなく `docs/issue/archive/` へ物理移動し、経緯を DB として残す
- status enum を発展させる: idea / open / wip / blocked / pending-sublimation / **discarded**(方針・環境変化で棄却、要 discard_reason) / **resolved**(close)
- category enum を導入する: idea / bug / request / design / task / tech-memo (kawaz の 7 リポ ~68 件の実 issue 分類から確定)
- 時系列メタ・reason を frontmatter に full ISO8601 + TZ で記録する(mtime 不使用)。reason は全て `string[]` (1-line JSON array) で統一

この発展は rules 側へ追従させて完結する(rules-revision-after-plugin issue)。プラグイン完成後に docs-knowledge-flow / docs-structure の該当定義をこのモデルへ改訂する。

## Alternatives Considered

- rules の 5 値・削除運用に揃える
  - 不採用理由: それは発展の退行。削除運用は旧前提(直読みガードなし)のもので、本プラグインはその前提を変えている。経緯を DB 化できる利点を捨てることになる
- enum 拡張をプラグイン独自にとどめ、rules へ反映しない
  - 不採用理由: 源流の rules と語彙がズレたまま放置すると grep / triage が壊れる(docs-knowledge-flow が schema 化する理由そのもの)。発展は源流への追従までで完結させる
- category を固定 enum でなく自由 tag / list 集計時の正規化に
  - 不採用理由: 正規化タイミングは書き込み時 (write/update) が最適で、読み出し (list) のたびに丸めるのは無駄。種類も少なく enum で足りる

## Consequences

- discarded / resolved は rules の 5 値に無い拡張。rules 側の追従改訂が必要(rules-revision-after-plugin issue, blocked_by 本体完成)
- category 判定・reason 正規化は内容判定を伴うため write/update は sonnet(DR-0001)
- 往復遷移(wip→blocked→wip)は `*-entered` 最新到達で上書き。全履歴が必要になったら JSON/SQLite へ移行し transitions 配列化する(当面は不要)

## 関連

- DR-0001 (command/skill 隔離)
- rules-revision-after-plugin issue (rules 側追従)
- docs-knowledge-flow / docs-structure (発展元の rules)
