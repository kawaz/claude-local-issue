---
title: list で gh issue も非同期チェックし local issue に取り込む
status: idea
category: request
created: 2026-06-18T21:30:00+09:00
last_read: 2026-06-20T12:00:00+09:00
open_entered:
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: 自リポ TODO
---

# list で gh issue も非同期チェックし local issue に取り込む

## 概要

list 実行時に、非同期で gh の issue リストもチェックし、あれば local issue
に落とし込む。issue URL があればリンクしておく。

## 背景

gh issue と local issue を横断して「今どの issue がどの状態か」を一覧したい
場面がある。ただし優先度は低い (コア CRUD が回ってからの拡張)。

## 要検討 (着手前に決める)

- **同期方向**: gh→local の一方向取り込み + URL リンクのみ (軽い) か、
  双方向同期 (local の status 変化を gh へ書き戻す、重い) か。二重管理・
  乖離を避けるなら一方向 + リンクが既定線。
- gh 側の close を local にどう反映するか (反映しないと乖離する)。
- 既存の gh issue 閲覧手段 (github-issue-pr-fallback.user.js 等) との
  用途重複。横断一覧したい時だけ価値が出る、なら用途を絞る。
- 非同期チェックのコスト。list は haiku / 機械的タスクの想定なので、
  gh API 呼び出しを足して list の軽さが崩れないか。

## 受け入れ条件

- [ ] 同期方向の方針を決定 (一方向 or 双方向)
- [ ] list の軽さを保ったまま gh チェックを非同期で挟める設計

## 解決時の記録先

- 設計判断を伴う (同期方向の決定): decisions/DR-NNNN-...md
- 単純な実装のみ: commit message で足りる

close 時はこのファイルを docs/issue/archive/ へ移動する (削除しない)。
