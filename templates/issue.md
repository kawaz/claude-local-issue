---
title: {タイトル}
status: open
category: {idea|bug|request|design|task|tech-memo}
created: {ISO8601 +TZ}
last_read:
open_entered: {ISO8601 +TZ}
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:    # 1-line JSON array string[] 例: ["discarded","環境が変わった"]
pending_reason:    # 1-line JSON array string[] 例: ["pending","v2 待ち"]
close_reason:      # close 時に update が記録。1-line JSON array string[] 例: ["dr/DR-0007","implemented"]
blocked_by:
origin: {自リポ TODO | 依頼元プロジェクト名}
---

# {タイトル}

## 概要

{何をしたいか、何が問題か}

## 背景

{なぜ必要か、どこから来た要望か}

## 受け入れ条件

- [ ] {完了の判定基準}

## TODO

<!-- wip 時のみ -->

- [ ] {次に手を付けるサブタスク}

## 解決時の記録先

- 単純なコード修正のみ: 記録不要 (commit message で足りる)
- 設計判断を伴う: decisions/DR-NNNN-...md
- 運用上の再発可能性: runbooks/<topic>.md
- 経緯・ハマり所: journal/YYYY-MM-DD-<slug>.md

close 時はこのファイルを docs/issue/archive/ へ移動する(削除しない。経緯を DB として残す)。
