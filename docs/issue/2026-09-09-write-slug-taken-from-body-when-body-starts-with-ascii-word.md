---
title: write の slug 解釈が本文の先頭 ASCII 単語に引きずられる
status: open
category: bug
created: 2026-09-09T18:34:54+09:00
last_read:
open_entered: 2026-09-09T18:34:54+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: ccmsg
---

# write の slug 解釈が本文の先頭 ASCII 単語に引きずられる

## 概要

`/local-issue:write <slug> --repo <path> <body...>` で、slug を先頭 token として渡し `--repo` の後に本文を続けた場合、**本文の 1 語目が ASCII 単語**だと、生成ファイル名・INDEX の slug・commit message がすべて渡した slug でなく本文の先頭 ASCII 単語になる。

## 背景

再現コマンド:

```
/local-issue:write file-read-paging-and-external-listing --repo <path> webui (ccmsg-webui スライス 5、Files タブ) が契約で…
```

このケースでは:

- 生成ファイル: `2026-09-09-webui.md` (期待: `2026-09-09-file-read-paging-and-external-listing.md`)
- INDEX の slug: `webui` (期待: `file-read-paging-and-external-listing`)
- commit message: `issue(design): webui` (期待: `issue(design): file-read-paging-and-external-listing`)
- title は本文から正しく要約されていた (影響なし)

同じ形で本文の 1 語目が日本語の場合 (`notification-lacks-mid --repo … 「notify」 topic の…`) は正しい slug になった。

仮説 (未検証、裏取りしてから採否判断すること):

- 「`--repo <path>` の直後の token」を slug と誤認している
- または本文から slug 候補を再抽出するロジックがあり、本文 1 語目が ASCII かつ slug-like (英数字+ハイフン相当) だとそちらを優先してしまう

いずれにせよ、仕様上は「先頭 1 token が slug、残りが body」という位置引数文法のはずで、本文の内容 (ASCII か日本語か) によって slug 解釈が変わるのは仕様外の分岐。

利用側 (ccmsg-webui スライス作業) で取ったワークアラウンド: 誤った issue を `jj file untrack` → 正しいファイル名へ `mv` → INDEX 修正 → `jj squash` で手直し。

## 受け入れ条件

- [ ] slug 誤認識の原因箇所を特定する (write コマンド実装 or skill 定義のどこで slug を再抽出/誤認しているか)
- [ ] 本文の先頭語が ASCII か日本語かに関わらず、渡された先頭 token が常に slug として使われることを確認する
- [ ] 再現ケース (本文 1 語目が ASCII 単語) を含む回帰確認を行う
