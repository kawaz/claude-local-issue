---
title: 利用側のセッションで不便だった点 (archive への移動で相対リンクが切れる、close_reason の指摘が close_ref に触れない、INDEX.md の差分が worker の間に残る)
status: open
category: request
created: 2026-11-15T07:45:00+09:00
origin: pam-passkey のセッションから (利用側で気づいた)
---

# 利用側のセッションで不便だった点

## 概要

pam-passkey の統括セッション (2026-11-15、worker を 5 つ並走) で、実際に使っていて不便だった点を 3 つ報告する。使っていなかった欄が消えた等の「無くなって気になっただけ」のものは含めていない。採否と直し方はこのリポの側で、裏を取ってから決めてほしい。

## 1. archive への移動で相対リンクが切れる

- 現象: issue を `resolved` にすると `docs/issue/archive/` へ移り、階層が 1 段深くなる。issue の本文の相対リンク (`../decisions/DR-0014-….md`、`../findings/….md`、`../QUESTIONS.md`) と、他の文書からその issue へのリンク (`../issue/2026-11-15-….md`) の両方が切れる
- 起きた回数: このセッションで 3 件の close の全部 (`encrypt-request-envelope`、`signing-badge-anchored-trust`、`add-setup-process-protection`)
- 利用側で取った対応: 移動の後に、本文の `(../` を `(../../` に置き換え、他の文書からのリンクを grep して `issue/archive/` に直した。3 件目からは、worker への指示に「archive に移ると 1 段深くなるので、issue の本文のリンクは `../../` で書く」と入れた (close する前の本文では、そのリンクは切れている)
- 所感: 移動の時に「このファイルの相対リンクが N 個、このファイルへのリンクが M 個ある」と知らせてもらえるだけでも、直し忘れが減る。plugin が書き換えるべきかは、正規化の範囲 (frontmatter だけを触る) との兼ね合いなので判断を委ねる

## 2. close_reason に理由の文を書いた時の指摘が、close_ref に触れない

- 現象: `close_reason` に理由の文 (「不採用 (…)。DR-0004 の不採用案に記載」) を書いたら、`close_reason の値 "…" は使えない。close_reason を implemented / documented / discarded / duplicate のどれかに書き換える` と指摘された。close の根拠の参照を置く欄 `close_ref` があることは、README を読むまで分からなかった
- 利用側で取った対応: 理由と参照先を本文の節 (「裁定」「結果」) に書いた。`close_ref` は 1 度も使っていない
- 所感: 指摘の文に「理由や参照先は `close_ref` (30 文字以内) か本文に書く」と一言あれば、その場で正しい置き場に書ける

## 3. INDEX.md の差分が、worker の作業コピーに残り続ける

- 現象: 統括が issue を書くと `INDEX.md` が書き換わる。同じ作業コピーで動く worker は、パスを絞って commit するので `INDEX.md` を commit に入れず、`jj status` に `M docs/issue/INDEX.md` が残る。このセッションでは、worker の完了報告のほぼ全部に「`docs/issue/INDEX.md` は別セッションの変更で、触っていない」という 1 行が付いた (5 つの worker で 20 回以上)
- 逆向きもあった: worker が issue を close して `INDEX.md` が変わり、その worker は自分の commit に入れたが、同じ時に別の worker の完了報告には「他人の変更」として載った
- 利用側で取った対応: 統括が気づくたびに `INDEX.md` だけを commit した
- 所感: 実害は報告の雑音と、統括の commit の手間。`INDEX.md` は生成物なので、「issue を変えた commit に `INDEX.md` も入れる」ことを、issue を書いたセッションへの知らせにもう一歩強く書く (今の `INDEX.md を更新した` の 1 行に、commit に含める旨を添える) と、書いた側で閉じられる

## 困っていない点 (参考)

- 起動時の正規化で使っていない欄 (`last_read`、`*_entered` 等) が消えたこと: 使っていなかったので影響なし。差分は最初の commit に入れた
- `INDEX.md` の題は、このセッションで書いた長い題 (60 文字前後) も切れずに出ている
