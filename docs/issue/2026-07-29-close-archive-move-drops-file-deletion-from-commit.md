---
title: close 実行時に元ファイルの削除が commit から漏れることがある (残留 diff を stale/無関係と誤判定する報告も)
status: wip
category: bug
created: 2026-07-29T00:08:07+09:00
last_read:
open_entered: 2026-07-29T00:08:07+09:00
wip_entered: 2026-07-31T23:12:45+09:00
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

## 現状 (2026-07-31)

修正は完了しているが、配布後の実 command 検証が残っているため close せず wip とする。

### 修正内容

- commit 6971c58 `fix(update): close 後の dirty を自動追補しない`: commands/update.md
  の close §6 で、存在しない `bump-semver vcs status` を実在する
  `bump-semver vcs is clean` に置換。dirty 時は成功を報告せず停止し、旧 path だけの
  自動追補 commit を禁止、`bump-semver vcs diff` で原因を確認する手順に変更。
  `--allow-nonexistent-path` を指定しない invariant を明記 (指定すると削除 path が
  黙って捨てられ、まさに検出したい削除漏れを隠すため)。
- commit 03d5c81 `test(commands): close の VCS fixture と sub-command 契約テストを追加`:
  commands/test/run-contracts.sh に temp git fixture を追加。3 path 指定の close
  commit 後に `vcs is clean` が clean になること、旧 path を省略した commit を
  `vcs is clean` が dirty として検出すること、を実機で固定。

### 発見した機械的原因 (実機確認済み)

- `bump-semver vcs status` は存在しないサブコマンド (実行すると
  `unknown vcs verb: status`、exit 2)。代替として本文が挙げていた `jj status` /
  `git status` も allowed-tools (`Bash(bump-semver vcs:*)` 等) に含まれず実行不能
  だった。つまり必須と書かれていた commit 後検証が 3 経路とも塞がっており、
  実行者は検証手段を持たないまま報告するしかなかった。これが受け入れ条件の
  「残留 diff を stale/無関係と誤判定する」の直接原因。
- bump-semver は path 解決が 1 つでも失敗すると
  `(use --allow-nonexistent-path to silently drop)` とヒントを出す。mv 済みの旧
  path はまさに「存在しない path」に該当するため、このヒントに従うと正しい 3
  path を渡していても削除が黙って捨てられ残留する (実機再現済み)。ただしこの
  フラグが実際の失敗事例で使われた直接証拠はなく、状況証拠にとどまる。
- ツール自体は正しい: 3 path 指定の close は git (R100) / jj (R) 両方で rename
  commit になり残留ゼロ (bump-semver v0.48.1 / jj 0.43.0 で確認)。

### 修正後の実測 (2026-07-31、ただし旧 0.2.10 cache の update.md で実行された close)

本セッションで 3 件の close を実行し、いずれも 3 path が揃っていた: 7e3c450 は
`D` + `A` + `M INDEX`、14fd3bd は `R053`、a7ee9d5 は `R056`。つまり旧版の指示でも
成功することはあり、失敗は確率的に起きていたことの裏付けになる。新版指示の効果は
この 3 件では測れていない。

## 受け入れ条件

- [ ] update (close) の実装で、archive 移動と commit のパス指定を突き合わせ、
      元パス削除が commit 対象に含まれない条件を特定する
- [ ] 特定した条件を修正するか、close 完了直後に自己検証 (working copy clean
      チェック) を入れて再発を防ぐ
- [ ] 「残留 diff を stale/無関係と誤判定して報告する」自己検証側の問題も
      合わせて確認 (= 誤判定を招く報告テンプレ・チェック漏れがないか)

## TODO

<!-- wip 時のみ -->

- [ ] v0.2.11 を push して plugin cache を更新した後、新版 commands/update.md
      で実際に close を複数回実行し、3 path commit と `vcs is clean` 検証が
      指示どおり行われることを確認する
- [ ] bump-semver 側の有害なエラーヒント (`--allow-nonexistent-path` の案内)
      について、上流リポへ部外者 issue を起票するかを判断する (まだ未起票)
