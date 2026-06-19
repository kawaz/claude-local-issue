---
title: プラグイン完成後に claude-rules-personal を local-issue 前提へ改訂する
status: blocked
category: task
created: 2026-06-18T20:10:00+09:00
last_read:
open_entered: 2026-06-18T20:10:00+09:00
wip_entered:
blocked_entered: 2026-06-20T00:24:30+09:00
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by: plugin 本体完成 (= v0.2.3) → claude-rules-personal session の手番
origin: 自リポ TODO (本プラグインは既存 rules の発展形であり、rule 改訂までが発展の完結)
---

# プラグイン完成後に claude-rules-personal を local-issue 前提へ改訂する

## 概要

このプラグインは claude-rules-personal の docs-knowledge-flow / docs-structure が定義する issue 運用(削除運用・5値 status)を発展させたもの(DR-0002)。プラグインが実機で固まったら、rules 側をこのプラグイン前提に改訂する。プラグインを作っただけでは発展は完結しない。

## 受け入れ条件

- [ ] docs-knowledge-flow の「issue 解決時は削除」記述を「local-issue プラグインで管理(close 時 archive へ移動・経緯を DB 化)」へ改訂
- [ ] docs-knowledge-flow / docs-structure の status enum (5値) を本プラグインの値に追従 (discarded / resolved の追加、archive 運用)
- [ ] docs-structure の issue テンプレを本プラグインの frontmatter 形式(full ISO8601 TS 群・category・close_reason 等)に追従
- [ ] 旧手動運用前提の記述を、プラグイン前提の記述へ置換 (no-historical-noise: 旧記述は残さず置換)

## 背景

本プラグインは rules の発展形。発展させたモデルが実運用で固まったら、源流である rules 定義を追従させて二重定義・齟齬をなくす。dogfooding-feedback-upstream の系譜。

## 解決時の記録先

- 改訂内容は claude-rules-personal 側の commit。本リポ側は journal に経緯を残して close

## blocked 状態の更新

2026-06-20 plugin 本体 v0.2.3 で完成、本 issue の blocked 条件 (= plugin 完成) は満たした。次は claude-rules-personal リポ側で rules 改訂作業 (docs-knowledge-flow / docs-structure / no-historical-noise の local-issue 前提への書き直し) を実施する責務に変わる。本 issue は blocked のまま維持し、claude-rules-personal session が進めた時点で本リポからは close 対象外として削除予定 (= 別 session 領域)。
