---
title: SessionStart 促しの件数しきい値を運用データで確定する
status: open
category: task
created: 2026-06-20T00:01:31+09:00
last_read:
open_entered: 2026-06-20T00:01:31+09:00
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

# SessionStart 促しの件数しきい値を運用データで確定する

## 概要

`hooks/issue-count-nudge.sh` が SessionStart 時に未解決 issue 件数が閾値超えていたら list 促しを流す挙動の **件数しきい値** をいくつにするか。現状 DESIGN.md の Open 節に「Item-count threshold for the SessionStart nudge」として未確定のまま、初期値 5 件 (= `CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD` env override 可)。

## 背景

initial-open-items の受け入れ条件の 1 つ。stale-days threshold issue と同様、本項も運用データ蓄積が必要なため独立 issue として分離。

## 確定のための材料

- 自分 (kawaz) の運用で「issue がこれ以上溜まったら能動的に確認したい」と感じる件数
- 各リポの issue 数推移 (= 立てる頻度 vs 解消する頻度)
- SessionStart で nudge が頻発しすぎないバランス

## 受け入れ条件

- [ ] 自リポ + cmux-msg + claude-plugin-reference の 3 リポで 2-3 週間運用、件数推移を観察
- [ ] N=5 が体感に合うか / もっと厳しい (3) / 緩い (10) のどれが良いか判定
- [ ] 確定値を DR-0004 または runbooks/count-threshold.md に記録 (stale-days と同 DR でも可)
- [ ] DESIGN.md の Open 節 (Item-count threshold for the SessionStart nudge) を削除
- [ ] env override (`CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD`) はそのまま残す

## 解決時の記録先

- 単純なコード修正のみ: 記録不要 (commit message で足りる)
- 設計判断を伴う: decisions/DR-NNNN-...md
- 運用上の再発可能性: runbooks/<topic>.md
- 経緯・ハマり所: journal/YYYY-MM-DD-<slug>.md

close 時はこのファイルを docs/issue/archive/ へ移動する(削除しない。経緯を DB として残す)。

## 関連

- 元 issue: docs/issue/archive/2026-06-18-initial-open-items.md (close 予定)
- 姉妹 issue: docs/issue/2026-06-20-read-stale-days-threshold.md (= 同じ運用観察期間で同時確定可)
- DESIGN.md "Open (to settle through use)"
