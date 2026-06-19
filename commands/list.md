---
description: ローカル issue 一覧を整理して返す。docs/issue/ 配下の active issue を slug / category / status / 放置期間(frontmatter TS の max からの経過)で集計・ソートして返す。フィルタ(status / category / 放置日数 / archive 含む)可。読むだけで丸め直しはしない。AI が「今どの issue がどの状態か」「溜まっている issue はどれか」を確認する時、ユーザが /local-issue:list で一覧したい時に使う。
argument-hint: '[--status <s>] [--category <c>] [--stale-days <n>] [--unread-only] [--include-archive]'
model: haiku
context: fork
agent: general-purpose
allowed-tools: "Read Bash(ls *) Bash(cat *) Bash(grep *) Bash(date *)"
---

