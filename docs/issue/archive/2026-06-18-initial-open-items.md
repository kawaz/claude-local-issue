---
title: 初期実装の未確定事項
status: resolved
category: task
created: 2026-06-18T20:00:00+09:00
last_read:
open_entered: 2026-06-18T20:00:00+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-06-20T00:03:05+09:00
discard_reason:
pending_reason:
close_reason: ["dr/DR-0003","implemented","split:read-stale-days-threshold","split:sessionstart-count-threshold"]
blocked_by:
origin: 自リポ TODO (設計セッションからの引き継ぎ)
---

# 初期実装の未確定事項

## 概要

設計は固まったが、しきい値・パス規約・fork 下の挙動は実機/実データなしには確定できないため初期値で置いた。実運用で詰める。

## 受け入れ条件

- [ ] リポ名 → ローカルパス解決の規約パス (`~/.local/share/repos/github.com/kawaz/<name>/main` 等) を write/list/read/update で確定・統一
- [ ] read 放置 → unread 戻しの日数しきい値を確定
- [ ] SessionStart 促しの件数しきい値の妥当性を運用で確認 (初期値 5 件)
- [ ] 各 command/skill の引数受け渡し方式 (frontmatter arguments / argument-hint vs 本文指示) を実機で確定
- [ ] commands/(list,read) と skills/(write,update) の混在が同一 plugin 内で共存し、全て `/local-issue:<name>` で起動できるか実機確認
- [ ] `context: fork` 下で write skill が本文 embed の `${CLAUDE_SKILL_DIR}/templates/issue.md` を Read できて起票まで通るか実機確認
- [ ] fork 下の各操作で model 指定(haiku/sonnet)が素直に効くか、context 持ち越し事故が起きないか確認

## 背景

設計セッションで「運用しながら決める」とした事項の集約。このプラグインが想定する frontmatter 形式で書かれた最初のドッグフード issue でもある。

## 解決時の記録先

- パス規約・しきい値の確定 → 設計判断なら decisions/、運用知見なら journal/

## close 経緯

v0.2.0 で DR-0003 として 5 項目を実装解決 (commit 950e47e)。残 2 項目 (stale-days, count-threshold) は read-stale-days-threshold / sessionstart-count-threshold に分離起票し継続観察。本 issue は resolved として archive 移動。
