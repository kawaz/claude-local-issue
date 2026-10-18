---
title: update の status 置換が BSD sed の 0,/re/ 非対応で失敗する
status: open
category: bug
created: 2026-10-18T14:17:14+09:00
last_read:
open_entered: 2026-10-18T14:17:14+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: claude-ccmsg
---

# update の status 置換が BSD sed の 0,/re/ 非対応で失敗する

## 概要

`/local-issue:update <slug> wip` で frontmatter の `status:` 行が `open` のまま置換されず、INDEX.md と `wip_entered` だけ更新された commit ができる (claude-ccmsg リポ、2026-10-18、macOS 25.5)。

## 背景

- 原因 (観測): update の固定フローが sed の `0,/^status:/s/…/` 形式のアドレスを使っており、BSD sed (macOS 標準) は `0,/re/` を解釈しない (GNU sed 拡張)
- worker はその後 2 つ目の commit で手で直した
- ワークアラウンド: 2 回目の Edit で `status:` 行を直接書き換え
- 裏取りしてから採否を決めて: フロー側の該当箇所は未確認、観測は update の出力報告から

## 提案

`0,/re/` を使わず、先頭の frontmatter 内の `^status:` 行だけを対象にする移植性のある形 (例: awk で最初の一致のみ、または Edit ツールで置換) にする。

## 受け入れ条件

- [ ] macOS (BSD sed) で update の status 置換が frontmatter の `status:` 行に反映される
