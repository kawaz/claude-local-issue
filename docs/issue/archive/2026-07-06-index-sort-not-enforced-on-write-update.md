---
title: write / update が INDEX.md のソート規約を守らない
status: resolved
category: bug
created: 2026-07-06T01:36:18+09:00
last_read: 2026-07-31T13:27:00+09:00
open_entered: 2026-07-06T01:36:18+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-07-31T13:31:00+09:00
discard_reason:
pending_reason:
close_reason: ["implemented: templates/index.md を列構成・canonical 順序・行形式の唯一の正本に格上げし、write / update の INDEX 反映を「対象行だけ除去 → canonical 位置へ再挿入、他行は変えない」に規定 (commit cbbe96b)。順序チェッカ commands/test/check-index-order.sh と良/悪 fixture の回帰テストを追加 (commit 03d5c81)、live INDEX は commit 34f59ce で canonical 化"]
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

- [x] write / update 実行後の `INDEX.md` が規約通りの順序 (status 優先順 +
      同 status 内 date 降順) になっているか実装を確認する
- [x] 未実装/不足であれば、差分更新経路にソート処理を追加するか、規約自体を
      見直すか判断する

## 裏取りの結果

部外者の推測どおり、差分更新経路に順序の規定が無かった。指示書の実際の文言:

- `write` は「この 1 件のエントリ行を追加(既存 slug なら該当行のみ更新)」
  としか書いておらず、挿入位置の規定が無い (= 末尾追記が契約違反にならない)
- `update` は「INDEX.md の該当 1 行のみ更新(status と、必要なら category)」で、
  status 変更後の行の並べ替えを指示していない
- ソート規約は `templates/index.md` の「雛形メモ (migrate sub-command 用)」に
  だけ書かれており、**migrate 専用の規約として読める形**だった。これが
  write / update の差分更新経路に効かなかった直接原因

## 修正内容

1. `templates/index.md` を「INDEX の列構成・canonical 順序・行形式の唯一の正本」
   に格上げ (= migrate 専用メモではなくなった)
2. `write` / `update` / `migrate` の INDEX 反映手順を、この正本を参照する形に統一。
   差分更新経路の契約を「**対象行だけを除去して更新後の canonical 位置へ再挿入する。
   既存の他の行の順序・内容は変えない**」に変更 (= 全体再ソートではなく局所更新。
   他 sub-command / 他セッションが触った行を巻き込まないため)
3. close (archive 移動) 時も「対象行の除去だけを行い、他の行は変えない」を明示

## 検証結果

- 順序チェッカ `commands/test/check-index-order.sh` を追加 (status 優先順 +
  同 status 内 date 降順の違反を行単位で報告)。`just check-index-order` で live
  INDEX に適用できる
- `just test` (`commands/test/run-contracts.sh`) に以下の回帰を追加:
  - チェッカ自身の良/悪 fixture (= チェッカが壊れて素通りするのを防ぐ)
  - `templates/index.md` が 5 列ヘッダ・status 優先順・date 降順を宣言していること
  - `write` / `update` が `templates/index.md` を正本として参照し、
    「既存の他の行の順序・内容は変えない」を含むこと
- live INDEX は違反 2 件 (open 群の date 逆転 / idea 行が open 群の後ろ) を
  検出後に canonical 化し、`just check-index-order` が ok になることを確認

## TODO

<!-- wip 時のみ -->
