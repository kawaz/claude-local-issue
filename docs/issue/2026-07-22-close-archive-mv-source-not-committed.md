---
title: update close の archive 移動で mv 元削除が commit から取りこぼされる (2 例再現)
status: open
category: bug
created: 2026-07-22T15:41:14+09:00
last_read:
open_entered: 2026-07-22T15:41:14+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz/kuu (部外者フラグ、実装判断は当事者に委ねる)
---

# update close の archive 移動で mv 元削除が commit から取りこぼされる (2 例再現)

## 概要

`local-issue:update` の close (archive 移動) 実行時、`archive/` への新規追加 +
INDEX 更新だけが commit され、mv 元 (`docs/issue/<slug>.md`) の削除が commit に
含まれず、削除を含む追加 commit が必要になる。

## 背景

再現 2 例 (いずれも 2026-07-21〜22、利用側 = kawaz/kuu と kawaz/kuu-cli):

1. kuu-cli の `help-conformance-no-gate` close 時 — close commit `1032bff8` が
   元ファイル削除を含まず、worker が後続 commit `0c239ec3` で削除を同梱して収拾。
2. kuu spec の `completion-ordering` 系 close 時 — 同型の取りこぼしで追加 commit
   が必要になった (codex worker 報告)。

推測 (裏取りしてから採否判断を): close の path 指定 commit 組み立てが「追加さ
れるファイル (archive 先 + INDEX)」だけを列挙し、mv の削除側 path を commit
対象に含めていない可能性。jj では削除も path 指定に含める必要がある
(git も同様、`git add` だけでは削除は拾われず `git rm` / `git add -A` 相当の
明示が必要)。

ワークアラウンド (利用側で実施): close 後に `jj status` / `git status` で元
path の残存 (削除が working copy に残る) を確認し、残っていれば削除 path を
含む追補 commit。

本 issue は部外者 (kawaz/kuu セッション) からのフラグに留める。具体的な実装
箇所・修正方法は close 実装の当事者が判断すること。

## 受け入れ条件

- [ ] close (archive 移動) 実行時、mv 元ファイルの削除が同一 commit に含まれる
      ことを確認 (git / jj 両方)
- [ ] 再発防止の検証 (テスト or 手動確認) が行われている

## TODO

<!-- wip 時のみ -->

- [ ] close の path 指定 commit 組み立てロジックを特定 (削除 path が漏れている
      箇所の裏取り)
