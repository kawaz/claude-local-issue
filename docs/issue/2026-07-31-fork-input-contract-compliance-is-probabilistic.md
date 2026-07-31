---
title: fork 入力契約の遵守が確率的で、修正後の実 command 再検証が未実施
status: open
category: bug
created: 2026-07-31T13:52:00+09:00
last_read:
open_entered: 2026-07-31T13:52:00+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: 2026-07-03-skill-tool-fork-invocation-drops-arguments (close 時の残余分離)
---

# fork 入力契約の遵守が確率的で、修正後の実 command 再検証が未実施

## 概要

`2026-07-03-skill-tool-fork-invocation-drops-arguments` は、全 5 sub-command に
「実行 task (これが唯一の入力)」block を置く入力契約 (commit dfee3eb) で close した。
ただしこの対策は **LLM の指示遵守に依存する**ため、効果は確率的で 100% ではない。
close 時点で残っていた 2 点をここに分離する。

1. 契約を満たす構造でも、フローを実行しつつ**出力形式を外す**ことがある
2. dfee3eb 適用後の **実 command での再検証が未実施** (PoC は temp command による対照実験)

## 背景

PoC の確定観測 (2026-07-31、claude v2.1.220、temp project の `.claude/commands/` に
`context: fork` / `agent: general-purpose` / `model: haiku` の検証用 command、計 24 run):

| 構造 | 結果 |
|---|---|
| 逐語 echo probe | 3/3 で `$ARGUMENTS` / `$0` / `$1` が展開 (= 引数は fork 先に届いている) |
| V1 (修正前構造。引数が `## 入力 ($ARGUMENTS)` 節と条件文にしか現れない) | **9/9 空振り**。フローを 1 歩も実行せず質問して終了 |
| V2 (修正後構造。冒頭に明示 task 行) | **8/9 実行**。引数あり 3/3、引数なし 3/3 (正しく空判定)、解釈不能 2/3 |

V2 の残り 1 回は「フローは実行したが手順を復唱して出力形式を外した」もので、
空振り (V1 の失敗モード) への退行ではない。つまり **失敗の質は下がったが、
ゼロにはなっていない**。

また、引数が空のとき `$0` が command 名に補完される揺れも観測されている
(3 回中 1 回、`/v3` の `$0` が `v3` になった)。dfee3eb はこれを「command 名 /
ファイル名から補完しない」で名指し禁止しているが、これも指示遵守依存である。

## 受け入れ条件

- [ ] dfee3eb 適用後の**実 command** (`read` / `list` / `write` / `update` / `migrate`)
      で、引数あり / なし / 解釈不能の各条件を複数回実行し、契約どおりの挙動
      (実行 / 正しい空判定 / reject) になる比率を実測する
- [ ] V1 型の退行 (= 空振り) を自動検出する手段を用意するか、見送るなら理由を記録する
- [ ] 出力形式の逸脱が実運用で問題になる頻度かを判断し、許容するなら割り切りとして記録する

## TODO

<!-- wip 時のみ -->

- [ ] 回帰検出の実装可否を判断する。PoC 側の知見では、V1 型の退行は「質問して終了」
      の形で 9/9 確実に出るため、`claude -p '/<cmd> <args>'` の出力に固定マーカー行が
      現れるかを見るだけで検出できる見通し。ただし実 command は副作用を伴うので、
      読み専の `list` に限定するか temp fixture を用意するかの設計が要る
- [ ] 「唯一の入力」宣言と、fork prompt に残る周辺 context (CLAUDE.md 等) の綱引きは
      未測定。契約の実効性を測るなら、この干渉も条件に入れる
