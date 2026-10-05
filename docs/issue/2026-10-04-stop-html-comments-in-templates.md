---
title: templates の HTML コメントをやめる (生成される INDEX.md / issue に見えない記述が残る)
status: open
category: request
created: 2026-10-04T13:17:55+09:00
last_read:
open_entered: 2026-10-04T13:17:55+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: claude-rules-personal
---

# templates の HTML コメントをやめる (生成される INDEX.md / issue に見えない記述が残る)

## 概要

`templates/index.md` と `templates/issue.md` が Markdown の HTML コメントを使っており、write / migrate が生成する利用側リポの `docs/issue/INDEX.md` と各 issue ファイルにそのまま残っている。利用側 (claude-rules-personal) で「Markdown に HTML コメントを書かない」規約と lint を入れたので、plugin 側でも HTML コメントをやめることを検討してほしい。直し方 (見える本文にする / plugin の docs 側へ移す / 消す、および正本の置き場の変更が `run-contracts.sh` や commands の参照に及ぼす影響) は当事者の判断に委ねる。採否は下の一次資料を裏取りしてから決めてほしい。

## 背景

### 現象 (一次資料)

- `templates/index.md` 9〜19 行目: コメントブロックに「INDEX の列構成・canonical 順序・行形式の唯一の正本:」として、列構成の固定、`{{rows}}` の置換、canonical 順序 (status 優先順 idea → open → wip → blocked → pending-sublimation、同 status 内は date 降順)、各行の形式、概要 80 文字省略の規約が入っている
  - このファイルは `commands/write.md:81` / `commands/update.md:74,85` / `commands/migrate.md:106` / `justfile:43` / `commands/test/check-index-order.sh:2` から「唯一の正本」として参照され、`commands/test/run-contracts.sh:117-119` がこのコメント内の文言を `assert_grep` で検査している
  - 生成先の INDEX.md の末尾にもこのブロックがそのまま入る。手元の 38 リポの `docs/issue/INDEX.md` のうち 9 リポで確認 (例: kawaz/passkey、kawaz/ccmsg、kawaz/ccmsg-webui、kawaz/cache-warden、kawaz/bump-semver)。入っていないリポもある (claude-rules-personal、claude-local-issue 自身)
- `templates/issue.md` 36 行目: `## TODO` 直下に wip 時のみを示すコメント
  - write が生成する issue にそのまま残り、手元のリポ群で 191 ファイル (archive 含む) に入っている。wip にならずに close された issue にも残る
- 参考: 利用側 claude-rules-personal の issue テンプレ (`reference/docs-authoring/templates/issue/`) では、frontmatter の手前に HTML コメントを置いていたため frontmatter が 1 行目から始まらなくなっていた。plugin の `templates/issue.md` は frontmatter が先頭にあるのでこの形では壊れていないが、同じ置き方をすると同じ壊れ方をする

### HTML コメントを避ける理由

1. 人間がプレビューで読むときに見えない。書き手と読み手で見えている内容がずれる (INDEX.md の「唯一の正本」が、INDEX.md をプレビューで開いた人には見えない)
2. ファイルの先頭に置くと frontmatter を壊す (frontmatter はファイルの 1 行目から始まる必要がある)
3. セキュリティ: 人間のレビューでは見えないが、AI はそのまま読む。隠れた指示 (プロンプトインジェクション) や、見せたくない情報の置き場になる。INDEX.md は write / update / migrate が毎回 AI に読ませるファイルなので、ここに見えない記述を置く形は特に影響が大きい

### 利用側で入れたもの

- claude-rules-personal に常時ロード rule `no-md-html-comments` を追加した
- 同リポの `just lint-rules` に検査 (k) を追加した。リポ内の `.md` 全部を対象に、コードフェンスとインラインコードの外にある HTML コメント開始記号を FATAL にする。このため、plugin が INDEX.md や issue にコメントを書き込むと、claude-rules-personal では push の lint で止まる (既存分は同リポで手で消した)

### 別件: write の本文をファイルで渡したい

この issue の起票で `--body-file <path>` を渡したところ、未知 flag として reject された。本文は位置引数でしか渡せないため、長文やバッククォートを多く含む本文を AI が引数に組み立てる必要があり、エスケープ事故の元になる。長文を受ける CLI はファイルパスで受ける方が安全 (kawaz の方針)。write / update の本文をファイルパスでも受けられるようにするかを検討してほしい。

## 受け入れ条件

- [ ] templates (index.md / issue.md) が HTML コメントを含まない
- [ ] 旧コメント内の正本記述の移設先を決め、commands / justfile / `run-contracts.sh` の参照と検査が追従している
- [ ] write / update の本文をファイルパスで受けるか否かの判断が記録されている

## TODO

## 別件: write が INDEX の canonical 順序を守らなかった (2026-10-05)

kawaz/passkey で write を実行したところ、新しい open の行が既存の wip の行の下に追加された (canonical 順序は idea → open → wip)。利用側で手で並べ直した。archive の `2026-07-06-index-sort-not-enforced-on-write-update` で対応済みのはずの事象なので、再発かどうかを裏取りしてほしい。
