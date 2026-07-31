---
title: close 実行時に元ファイルの削除が commit から漏れることがある (残留 diff を stale/無関係と誤判定する報告も)
status: resolved
category: bug
created: 2026-07-29T00:08:07+09:00
last_read:
open_entered: 2026-07-29T00:08:07+09:00
wip_entered: 2026-07-31T23:12:45+09:00
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-08-01T08:38:20+09:00
discard_reason:
pending_reason:
close_reason: ["implemented"]
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

## 現状 (2026-08-01)

修正完了。v0.2.11 配布後の実機検証で 12/12 成功を確認した。

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

### v0.2.11 配布後の実機検証 (2026-08-01、12/12 成功)

`/private/tmp` の使い捨て fixture repo で、新版 `commands/update.md` による close を
12 回実行した。本リポの `docs/issue/` は検証に一切使っていない。

検証手順: fixture repo (active issue 3 件 + INDEX.md + `archive/`) を毎回作り直し、
別プロセスの `claude -p '/local-issue:update <slug> --status <s> --reason "..."'` を
実行。各 fork の transcript に埋め込まれた plugin root を grep して
`local-issue/local-issue/0.2.11` であることを 12 回とも確認済み (= 旧 0.2.10 cache
での実行ではない)。

| # | VCS | status | 対象 slug | commit | name-status |
|---|---|---|---|---|---|
| 1 | git | resolved | alpha-parser-bug | 5109495 | `M INDEX.md` + `R086` |
| 2 | git | discarded | gamma-cli-help | e2e138d | `M INDEX.md` + `R082` |
| 3 | jj | resolved | alpha-parser-bug | fbc9094e92a1 | `M INDEX.md` + `R docs/issue/{ => archive}/…` |
| 4 | jj | discarded | gamma-cli-help | e63c330c0b56 | `M INDEX.md` + `R docs/issue/{ => archive}/…` |
| 5 | git | resolved | beta-cache-miss | 296804c | `M INDEX.md` + `R086` |
| 6 | git | discarded | alpha-parser-bug | 8251344 | `M INDEX.md` + `R079` |
| 7 | jj | resolved | beta-cache-miss | 4cc6a32edfa4 | `M INDEX.md` + `R docs/issue/{ => archive}/…` |
| 8 | jj | discarded | alpha-parser-bug | 1b3e44ea19f0 | `M INDEX.md` + `R docs/issue/{ => archive}/…` |
| 9 | git | resolved | gamma-cli-help | bd6b114 | `M INDEX.md` + `R083` |
| 10 | git | discarded | beta-cache-miss | 5d0ad98 | `M INDEX.md` + `R082` |
| 11 | jj | resolved | gamma-cli-help | 327098f406e6 | `M INDEX.md` + `R docs/issue/{ => archive}/…` |
| 12 | jj | discarded | beta-cache-miss | d6b037f21a78 | `M INDEX.md` + `R docs/issue/{ => archive}/…` |

全 12 回で共通に成立した事実:

- commit は 3 path 指定 (旧 path / archive path / INDEX.md) の 1 本のみ。旧 path を
  省いた実行はゼロ
- `--allow-nonexistent-path` の使用はゼロ (全 transcript を grep して 0 件)
- 旧 path の削除は git / jj とも rename (`R`) に畳まれて commit に含まれた。
  残留 `D` はゼロ
- close 後に `bump-semver vcs is clean` が実行され、12 回とも exit 0
- 事後に検証者側で `git status --porcelain` / `jj status` / `bump-semver vcs is clean`
  を再確認しても残留差分ゼロ
- archive 済みファイルの frontmatter (`resolved_entered` / `discarded_entered` /
  `close_reason` / `discard_reason`) と INDEX の canonical 順序も正しく更新されていた

成功率 **12/12 = 100%**。旧版では確率的に失敗していた挙動が、少なくとも本条件下では
再現しなくなった。

検証の限界 (= この検証が主張しないこと):

- `claude -p` の非対話モードでは command frontmatter の `allowed-tools` による Bash
  制限が実効せず、fork は `git status` 等も実行できた (probe で確認)。つまり本番の
  対話セッションより検証手段が広い環境での測定である。ただし新版が必須化した
  `bump-semver vcs is clean` は本番の allowed-tools にも含まれ、12 回とも実際に
  実行されているので、必須経路自体は検証できている
- 12/12 は「失敗率 50% 程度なら 12 連続成功の確率は 0.02% 未満」という意味での
  否定的証拠であって、失敗率ゼロの証明ではない

## 受け入れ条件

- [x] update (close) の実装で、archive 移動と commit のパス指定を突き合わせ、
      元パス削除が commit 対象に含まれない条件を特定する
      (= commit 後検証の 3 経路が全て塞がっていたこと、および
      `--allow-nonexistent-path` ヒントに従うと削除が黙って捨てられること)
- [x] 特定した条件を修正するか、close 完了直後に自己検証 (working copy clean
      チェック) を入れて再発を防ぐ (= `bump-semver vcs is clean` を必須化)
- [x] 「残留 diff を stale/無関係と誤判定して報告する」自己検証側の問題も
      合わせて確認 (= dirty 時は成功を報告せず停止する手順に変更)

## 本 issue のスコープ外に残る項目

close 判断には影響しないが、失わないよう記録しておく。

- bump-semver の `--allow-nonexistent-path` エラーヒントは、削除済み path を
  渡す正当なケース (= 本 issue の close commit) で「そのフラグを付けろ」と
  誘導してしまう。上流 (kawaz/bump-semver) へ部外者 issue を起票するかは未判断。
  本リポ側の修正 (フラグを使わない invariant の明記) は完了済みなので、
  claude-local-issue の受け入れ条件としては充足している。
