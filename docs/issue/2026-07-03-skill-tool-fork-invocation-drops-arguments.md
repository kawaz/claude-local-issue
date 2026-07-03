---
title: AI の Skill tool 経由起動で context:fork の command が $ARGUMENTS を受け取らず空振りする
status: open
category: bug
created: 2026-07-03T17:57:34+09:00
last_read:
open_entered: 2026-07-03T17:57:34+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: hyoui セッション (a7761122) の dogfooding 観測
---

# AI の Skill tool 経由起動で context:fork の command が $ARGUMENTS を受け取らず空振りする

## 現象

AI (メインセッションの Claude) が **Skill tool** で `local-issue:list` / `local-issue:read`
を起動すると、fork 先の agent が command の固定フローを実行せず一般応答を返して終わる。
2 sub-command で 2 回再現。

- 環境: Claude Code 2.1.199 / plugin local-issue 0.2.10 / メインは Fable モデル /
  personal 面 (`~/.claude-personal`)

## 再現と観測 (2026-07-03、hyoui リポのセッションで観測)

1. `Skill(skill="local-issue:list")` (args なし)
   → 戻り値は `Skill "local-issue:list" completed (forked execution).` の後に
   **セッション開始の挨拶文** (「ご指示をお待ちしています」)。一覧処理は実行されない
2. `Skill(skill="local-issue:read", args="tx-lock-unlock-cli-subcommands")`
   → fork 先は command doc 自体は認識している応答
   (「I see the skill documentation for local-issue:read has been provided」) をしつつ、
   **「you haven't asked me to read a specific issue yet」と args が届いていない**旨を
   返して終了。last_read 記録も行われない

観測 2 から、fork 先には command 本文 (SKILL doc) は渡っているが、`$ARGUMENTS` / `$0`
の substitution が起きていない (= 空のまま) ように見える。

## 未検証の切り分け (= 担当側で裏取りしてほしい)

- **ユーザが `/local-issue:read <slug>` を手打ちした場合**に同じ現象が出るか
  (本観測は AI の Skill tool 経由のみ。手打ち経路が正常なら「AI 起動経路限定」の問題)
- 原因が plugin 側 (frontmatter の `context: fork` + `agent: general-purpose` +
  `model: haiku` の組合せ) にあるのか、Claude Code 本体の Skill tool → fork 実行の
  args 受け渡しにあるのか。後者なら本 issue は上流 (anthropics/claude-code) への
  報告に化ける可能性がある
- plugin の他 command (`write` / `update` / `migrate`) も同経路で空振りするか
  (副作用があるため本セッションでは未検証)

## 利用側で取ったワークアラウンド

hyoui セッションでは issue の read / update を直接 Read/Edit で代替した
(hook の注意は承知の上で、command 経路が壊れているため)。last_read 等の
frontmatter 更新は手動で行う必要があった。

## 部外者スタンスの注記

本 issue は hyoui セッション (部外者) からのフラグで、plugin 内部の実装は読んでいない
(commands/*.md の frontmatter と本文冒頭のみ確認)。観測も 1 セッション内 2 回のみ。
採否・原因特定は担当側で裏取りの上で判断してほしい。
