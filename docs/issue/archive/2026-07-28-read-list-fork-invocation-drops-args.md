---
title: read と list の forked 実行が args を受け取らず即終了する (update/write は正常)
status: discarded
category: bug
created: 2026-07-28T23:07:26+09:00
last_read: 2026-07-31T13:34:00+09:00
open_entered: 2026-07-28T23:07:26+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered: 2026-07-31T13:42:00+09:00
resolved_entered:
discard_reason: ["discarded","2026-07-03-skill-tool-fork-invocation-drops-arguments の重複 (同一の fork 引数伝搬事象を read/list 側から観測したもの)。両者の受け入れ条件は統合先の本文に反映済みで、統合先は 2026-07-31 に resolved で close"]
pending_reason:
close_reason: ["discarded","duplicate of 2026-07-03-skill-tool-fork-invocation-drops-arguments"]
blocked_by:
origin: rules-personal (依頼元プロジェクト)
---

# read と list の forked 実行が args を受け取らず即終了する (update/write は正常)

## 概要

メインセッションから Skill tool で `local-issue:list` (args なし) と
`local-issue:read <slug>` (args あり) を invoke すると、fork された agent が
「具体的な指示や質問が含まれていません」「I don't see an explicit task in your
message」と返して即終了する (tool_uses: 0)。同一セッション・同一時間帯に
`local-issue:update <slug> close --reason ...` と `local-issue:write --project
... <本文>` は正常動作 (commit まで完走) している。

## 背景

観測環境: Claude Code のメイン (claude-fable-5[1m]) から Skill tool invoke、
2026-07-28、rules-personal リポの cwd。

再現手順:
1. メインから `local-issue:list` (args なし) を Skill tool で invoke → fork
   先が即終了、tool_uses: 0
2. メインから `local-issue:read rules-structure-reorganization` を invoke →
   同様に即終了
3. `local-issue:read rules-structure-reorganization --update-last-read` も
   同様
4. 同時間帯に `local-issue:update <slug> close --reason ...` と
   `local-issue:write --project ... <本文>` は正常動作 (commit まで完走)

fork 機構全般の問題ではなく read/list 固有に見える。観測ベースの仮説
(裏取り要、部外者の推測混じり): read/list と update/write で command 定義の
プロンプト構成 (args の埋め込み方 / 指示文の有無) に差があり、fork 先に
task 本文が渡っていない可能性。plugin の command 定義同士を突き合わせて
裏取りしてから採否を判断してほしい。

ワークアラウンド (利用側で採用中): メイン側で直接 issue ファイルの
frontmatter を読む。この場合 last_read の記録はできない。

## 受け入れ条件

- [x] read/list の forked 実行時に args (省略時含む) が正しく task として
      渡ることを確認 (再現環境で tool_uses > 0 になる)
- [x] update/write との command 定義差分を特定し、原因を記録

## 重複判定 (2026-07-31)

`2026-07-03-skill-tool-fork-invocation-drops-arguments` と同一事象の別観測のため
**duplicate として discarded**。以降の記録は統合先 (archive) を参照。

両受け入れ条件の扱い:

- **command 定義差分の特定**: 統合先で結論を記録した。当時の 5 command は
  `## 入力 ($ARGUMENTS)` の同一構成で、read/list だけが不利になる定義差分は
  **無かった** (差分は `model` / `effort` / `allowed-tools` のみ)。本 issue の
  「read/list 固有」という見立ては、症状の見え方が model tier で分岐すること
  (低 tier fork は no-op で目立ち、高 tier fork は文脈から任務を創作して完走して
  しまうため一見正常に見える) による観測バイアスだった。2026-07-04 には update でも
  同型の伝搬失敗が観測されている
- **args が task として渡ることの確認**: 統合先の PoC で確定した。**args は
  fork 先に届いており** (`$ARGUMENTS` / `$0` / `$1` の展開を 3/3 で確認)、本 issue
  表題の「args を受け取らず」は字義としては誤り。空振りの実体は「展開値が実行すべき
  task として認識されない」ことで、修正前構造は 9/9 空振り・実行 task block を持つ
  構造は 8/9 実行。dfee3eb で後者の構造に統一済み。ただし成功率は確率的なので、
  その残余は `2026-07-31-fork-input-contract-compliance-is-probabilistic` へ分離した

## TODO

<!-- wip 時のみ -->
