---
title: read 放置 → unread 戻しの stale-days しきい値を運用データで確定する
status: open
category: task
created: 2026-06-20T00:00:13+09:00
last_read:
open_entered: 2026-06-20T00:00:13+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: initial-open-items から分離 (= initial-open-items 本体 close 時に残る運用判定事項)
---

# read 放置 → unread 戻しの stale-days しきい値を運用データで確定する

## 概要

`/local-issue:list` の `--unread-only` フィルタ、および将来追加されうる「read してから N 日経ったら unread に戻す」挙動の **N (= stale-days)** をいくつにするか。現状 DESIGN.md の Open 節に「Exact day count for stale -> unread reset」として未確定のまま、初期値 14 日 (= `CLAUDE_LOCAL_ISSUE_STALE_DAYS` env override 可)。

## 背景

initial-open-items (= 初期実装の未確定事項) の受け入れ条件の 1 つ。本体は v0.2.0/v0.2.1 で 5/7 解消したので close 予定だが、本項は運用データ蓄積が必要なため独立 issue として分離。

## 受け入れ条件

- [ ] 自リポ + cmux-msg + claude-plugin-reference の 3 リポで 2-3 週間運用、放置日数分布を観察
- [ ] N=14 が体感に合うか / もっと短い (7) / 長い (30) のどれが良いか判定
- [ ] 確定値を DR-0004 または runbooks/stale-days-threshold.md に記録
- [ ] DESIGN.md の Open 節 (Exact day count for stale -> unread reset) を削除
- [ ] env override (`CLAUDE_LOCAL_ISSUE_STALE_DAYS`) はそのまま残す (= 値だけ確定)

## 解決時の記録先

- 単純なコード修正のみ: 記録不要 (commit message で足りる)
- 設計判断を伴う: decisions/DR-NNNN-...md
- 運用上の再発可能性: runbooks/<topic>.md
- 経緯・ハマり所: journal/YYYY-MM-DD-<slug>.md

close 時はこのファイルを docs/issue/archive/ へ移動する(削除しない。経緯を DB として残す)。

## 関連

- 元 issue: docs/issue/archive/2026-06-18-initial-open-items.md (close 予定)
- DESIGN.md "Open (to settle through use)"
- DR-0003 (= commands 統一、本項とは独立)

## 確定のための材料

- 自分 (kawaz) の運用で「読んでから N 日経ったら忘れて再度 nudge してほしい」と感じるタイミング
- 各リポの issue 平均寿命 (= /local-issue:list で放置日数を観察)
- session 復帰時の負担感 (= 多すぎても少なすぎても不快)
