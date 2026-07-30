---
title: close 実行時に元ファイルの削除が commit から漏れることがある (残留 diff を stale/無関係と誤判定する報告も)
status: open
category: bug
created: 2026-07-29T00:08:07+09:00
last_read:
open_entered: 2026-07-29T00:08:07+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: 依頼元プロジェクト (claude-rules-personal 統括セッション)
---

# close 実行時に元ファイルの削除が commit から漏れることがある (残留 diff を stale/無関係と誤判定する報告も)

## 概要

`update <slug> close` を fork 実行すると、archive 側の追加ファイル + INDEX 更新は
commit されるが、`docs/issue/` 直下にあった元ファイルの削除が working copy に
残ることがある (= commit されずに D として残留する)。

## 背景

2026-07-28〜29 の同一セッションで 2 回観測:

- worktree 系 issue 2 件の close 後に `D` 2 件残留
- gh-issue-guard-plugin の close 後に `D` 1 件残留。このケースでは fork 自身が
  最終報告で残留 D を「stale/unrelated、対処不要」と誤判定していた

放置すると次の ensure-clean gate で push が止まる (実際に発生済み)。

一方、同セッションの他の close (runbook-naming 等) では削除も commit に含まれて
おり、常に再現するわけではない。

観測ベースの仮説 (裏取り要): archive への移動を cp+rm でなく段階的に行う際、
commit のパス指定に元パスが含まれるか否かが実行毎に揺れている可能性。

ワークアラウンド (依頼元側で実施中): close 後に `jj status` / `git status` を
確認し、残留 D を別 commit で固定。

追加観測 (llm-gateway リポ, cross-project report, 2026-07-29〜30, 別セッション):

- 1 回目: close 後に `jj status` で `D docs/issue/2026-07-28-cred-sharing-refresh-race-staleness.md` が残留
- 2 回目: 2 件同時 close 後に `D docs/issue/2026-07-29-refresh-task-panic-strands-in-flight.md` と
  `D docs/issue/2026-07-30-client-errors-not-logged.md` が残留
- いずれも archive/ 側のコピーと INDEX 更新は commit 済み。ワークアラウンドは同じ
  (残留 D を後追いで `jj commit -m "issue(close): ... 取りこぼしを回収" <paths>` して回収)

追加の仮説 (裏取り要、既存仮説に加えて): close の実装が「cp → 新パスと INDEX を
パス指定 commit → rm」の順だと、rm が commit の後になり削除が @ に残る。パス指定
commit に旧パス (削除) を含めるか、mv で rename を 1 操作にすれば安定するのでは。
ただし skill 実行 agent の裁量 (手順の揺れ) 由来の可能性もあり断定はしない。

## 受け入れ条件

- [ ] update (close) の実装で、archive 移動と commit のパス指定を突き合わせ、
      元パス削除が commit 対象に含まれない条件を特定する
- [ ] 特定した条件を修正するか、close 完了直後に自己検証 (working copy clean
      チェック) を入れて再発を防ぐ
- [ ] 「残留 diff を stale/無関係と誤判定して報告する」自己検証側の問題も
      合わせて確認 (= 誤判定を招く報告テンプレ・チェック漏れがないか)

## TODO

<!-- wip 時のみ -->
