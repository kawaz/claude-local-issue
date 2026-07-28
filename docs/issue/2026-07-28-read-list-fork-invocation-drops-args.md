---
title: read と list の forked 実行が args を受け取らず即終了する (update/write は正常)
status: open
category: bug
created: 2026-07-28T23:07:26+09:00
last_read:
open_entered: 2026-07-28T23:07:26+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
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

- [ ] read/list の forked 実行時に args (省略時含む) が正しく task として
      渡ることを確認 (再現環境で tool_uses > 0 になる)
- [ ] update/write との command 定義差分を特定し、原因を記録

## TODO

<!-- wip 時のみ -->
