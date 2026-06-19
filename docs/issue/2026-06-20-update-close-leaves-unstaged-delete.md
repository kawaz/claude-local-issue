---
title: update skill の close フローで元 file の delete が commit に含まれない
status: open
category: bug
created: 2026-06-20T00:12:20+09:00
last_read:
open_entered: 2026-06-20T00:12:20+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: dogfood で発見 (v0.2.0-v0.2.2 の 3 回の close で再現確認)
---

# update skill の close フローで元 file の delete が commit に含まれない

## 概要

`/local-issue:update --status resolved` (or discarded) の close フローで、対象 file を `docs/issue/<file>.md` から `docs/issue/archive/<file>.md` へ移動するが、**生成された commit には archive 側の `A` (add) と `INDEX.md` の `M` (modify) のみ含まれ、元 path の `D` (delete) が含まれない**。

結果:
- 元 file の delete が後続 commit に「unstaged delete」として紛れ込む
- 履歴的に「close commit」が clean に分離されない (= 後の feature commit に混入)
- 実害は小さい (= データ損失なし) が、git log の責務分離が崩れる

## 背景

v0.2.0 〜 v0.2.2 で計 3 回再現:

1. commit `8c873e3 issue(close): initial-open-items -> archive` — A archive のみ
2. commit `61579a0 issue(close): cmux-msg-dogfood-migration-feedback -> archive` — 同上
3. commit `94b3a18 issue(close): update-input-format-improvements-from-9cell-trial -> archive` — 同上

確認:

```bash
git show --name-status 94b3a18
# M docs/issue/INDEX.md
# A docs/issue/archive/...md
# (元 path の D がない)
```

それぞれの後続 commit で元 path の D を吸収している。

## 原因仮説

`bump-semver vcs commit -m "..." docs/issue/<old> docs/issue/archive/<new> docs/issue/INDEX.md` の path 指定で、`docs/issue/<old>` (= 既にファイルシステムから消えた path) が **「存在する path のみ stage」する仕様で、delete を track しない**可能性。

または、close skill 本体 (commands/update.md の close フロー Step 4: archive 移動) で `mv` を使った後、bump-semver vcs commit に「元 path の delete を明示する」step が欠落している。

## 修正案

### (a) close フローで mv 前に元 path を git/jj に明示削除

```bash
git rm docs/issue/<file>.md  # or jj 相当
cp <archive 用に必要なら> docs/issue/archive/<file>.md
# INDEX 更新
bump-semver vcs commit ...
```

### (b) mv + bump-semver vcs commit の path 指定で削除も含むように bump-semver 改修

これは bump-semver 側 (= 別リポ) の改修が必要。

### (c) close フロー Step 5 で commit 前に `git status --short` で D 検出した場合 path に追加

= 雑な workaround

## 受け入れ条件

- [ ] commands/update.md の close フロー Step 4 (archive 移動) と Step 6 (commit) を修正
- [ ] close commit に元 path の D が含まれることを実機確認
- [ ] 後続 commit に「unstaged delete」が紛れ込まないことを確認

## 解決時の記録先

- 単純なコード修正のみ: 記録不要 (commit message で足りる)
- 設計判断を伴う: decisions/DR-NNNN-...md
- 運用上の再発可能性: runbooks/<topic>.md
- 経緯・ハマり所: journal/YYYY-MM-DD-<slug>.md

close 時はこのファイルを docs/issue/archive/ へ移動する(削除しない。経緯を DB として残す)。
