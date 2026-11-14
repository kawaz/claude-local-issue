---
title: write の本文をファイルパスで受けられるようにしたい
status: resolved
category: request
created: 2026-10-21T01:28:40+09:00
origin: llm-gateway
close_reason: implemented
close_ref: DR-0006
---

# write の本文をファイルパスで受けられるようにしたい

## 概要

llm-gateway で write に 3KB 前後の markdown (見出し・箇条書き・コードブロック入り) を本文として渡そうとして、body-file オプションを付けたところ「repo / status / origin 以外のハイフン始まり token は reject」で起票されなかった (2026-10-21)。位置引数に本文を直接載せて再実行して通った。

さらに、この不具合を起票する本文自体に body-file・ns・for のような CLI オプション例をハイフン付きで書いたら、同じ判定で reject された。本文の内容が flag 判定に依存している。

## 背景

- AI が長文を引数で渡すと、バッククォート・ドル記号・改行のエスケープ事故が起きやすい (claude-rules-personal の memory「ai-cli-pass-long-text-by-file」に同じ趣旨の運用方針がある: kawaz 製 CLI は長文をファイルパスで受ける)
- 本文に CLI の使用例を書けない (ハイフン始まりの token を含むと reject)
- 発生したセッションのリポ: kawaz/llm-gateway (docs/issue/2026-10-21-otel-observability-for-dev-environment.md の起票時)

## 提案 (採否は当事者に委ねる)

- body の位置に既存ファイルのパスが来たらその中身を本文として読む、または本文ファイルを指すオプションを受ける
- update の body-edit も同様
- flag 判定は先頭の引数列だけに限り、本文 (slug より後ろ) は走査しない

## 受け入れ条件

- [ ] 長文を引数でなくファイル経由で渡して起票できる
- [ ] 本文中のハイフン始まり token が flag 判定で reject されない
