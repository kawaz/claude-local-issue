---
description: ローカル issue を 1 件読んで内容を返し、last_read を記録する。読んだら必ず「次の方針(pending / 対応 / 設計)を決めて update でステータス反映するまで」を呼び出し側の TODO に積ませる。read しっぱなしの放置を防ぐ。AI が特定 issue を読んで対応検討する時、ユーザが /local-issue:read で読みたい時に使う。
argument-hint: '[slug or file]'
model: haiku
context: fork
agent: general-purpose
allowed-tools: "Read Edit Bash(cat *) Bash(date *) Bash(bump-semver vcs commit *)"
---

