---
title: write / update が INDEX.md のソート規約を守らない
status: open
category: bug
created: 2026-07-06T01:36:18+09:00
last_read:
open_entered: 2026-07-06T01:36:18+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz/kuu (spec リポ) — 部外者起票
---

# write / update が INDEX.md のソート規約を守らない

## 概要

`docs/issue/INDEX.md` の雛形メモには「status 優先順
idea→open→wip→blocked→pending-sublimation、同 status 内 date 降順」という
ソート規約が書かれているが、少なくとも以下 2 点で差分更新経路がこの規約を
守っていないように見える (部外者からのフラグ、実装未確認):

1. **write sub-command**: 新規 issue 行を表の末尾に追記するため date 降順が壊れる
2. **update sub-command**: status 変更 (例: open→wip) 後に行を並べ替えないため
   status 優先順が壊れる

現に本リポ自身の `docs/issue/INDEX.md` (このファイル作成時点) も規約通りの
順序になっていない: 先頭行が `2026-07-03 bug open` で、続く行が
`2026-06-20 task wip` → `task open` ×2 → `task idea`。規約 (idea が先頭、
同 status 内は date 降順) に照らすと `idea` 行が末尾にあるなど順序が一致しない。

## 背景

利用側の 2 プロジェクトで以下を実機観測した (部外者 = 起票者はこの plugin の
実装コードを読んでいない、裏取りは当事者側で行ってほしい):

- **kuu.mbt slice リポ**: write で新規起票した `2026-07-06` 行が、既存の
  `2026-07-05` 群より下 (表の末尾) に追記された
- **kawaz/kuu spec リポ**: update で status を `open→wip` に変更した行が
  並べ替えられず、`open` 群より先頭に残った

両実例とも 2026-07-06 に観測し、利用側では手で行を並べ替えるワークアラウンド
を取った (kuu spec 側 commit `f66d4106`)。

`migrate` sub-command は INDEX 全体を再生成するため直る想定だが、`write` /
`update` の差分更新経路にソート処理が未実装 (または不足) の可能性がある。

裏取りしてから採否を決めてほしい — 実装 (write/update の INDEX 反映処理) を
読んで、ソート規約通りに並べ替えているか確認するのが起点になりそう。

## 受け入れ条件

- [ ] write / update 実行後の `INDEX.md` が規約通りの順序 (status 優先順 +
      同 status 内 date 降順) になっているか実装を確認する
- [ ] 未実装/不足であれば、差分更新経路にソート処理を追加するか、規約自体を
      見直すか判断する

## TODO

<!-- wip 時のみ -->
