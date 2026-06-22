---
title: skill 群が repo root 確定で `git rev-parse --show-toplevel` を直叩きしている (= `bump-semver vcs get root` の抽象漏れ)
status: wip
category: bug
created: 2026-06-22T16:58:58+09:00
last_read: 2026-06-22T17:45:06+09:00
open_entered: 2026-06-22T16:58:58+09:00
wip_entered: 2026-06-22T17:25:41+09:00
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz/hyoui
---

# skill 群が repo root 確定で `git rev-parse --show-toplevel` を直叩きしている (= `bump-semver vcs get root` の抽象漏れ)

## 概要

local-issue v0.2.4 の commands/*.md の **全 skill** が「§固定フロー」内で repo root 確定に `git rev-parse --show-toplevel` を直接使っている。`bump-semver vcs get root` という jj/git 両対応の抽象 API があるにもかかわらず、そこだけ git 直叩きで抽象漏れが生じている。

## 背景

commit / is-clean / outdated 系は `bump-semver vcs commit` / `vcs is clean` / `vcs outdated` 経由で git/jj agnostic に書かれているのに、root 確定だけ `git rev-parse --show-toplevel` 直叩きになっている。

kawaz/hyoui (jj 管理リポ) で local-issue:list を呼んだ際、kawaz から「jj 理解せずに作業してる感じ?」と指摘。確認したところ commit 系は `bump-semver vcs` 経由で両対応だが、root 確定だけ抽象漏れだった。

実際に確認した箇所:

- commands/list.md:27 `cd <root> && git rev-parse --show-toplevel`
- commands/migrate.md:24 同上
- commands/write.md:26 同上
- commands/update.md: allowed-tools にあり、フロー内で使用
- commands/read.md: 未確認だが同パターンの可能性

加えて全 skill の frontmatter `allowed-tools` に `Bash(git rev-parse:*)` がリストされている。

## 受け入れ条件

- [x] 全 skill のフロー内 `git rev-parse --show-toplevel` が `bump-semver vcs get root` に置き換えられている — commands/{list,migrate,read,write}.md + SKILL.md は commit e3ef83c で確定済。commands/update.md は kawaz の他 dirty (cp+rm→mv 取消、--staged モード説明削除) と同居しており、私の rev-parse 削除も dirty に同梱され残置中 (= kawaz が他 dirty を確定するタイミングで一緒に反映される想定)。
- [x] 各 skill の frontmatter `allowed-tools` から `Bash(git rev-parse:*)` が削除されている — 同上、update.md 以外は確定済、update.md は dirty 同居で残置。
- [ ] エラー時の文言 (= 解決失敗時の報告メッセージ) も VCS-agnostic な表現に統一 — 4 skill + SKILL.md は「<root> は VCS リポではない」に統一済。update.md は元々 root 確定の説明文がなかったので該当なし。
- [ ] 既存 issue 起票テスト (= write skill 経由でこの issue を kick した時の動作確認) — 練習 commit 時に未実施。実装後の write skill 動作確認は別途。

## TODO

<!-- wip 時のみ -->

- [ ] 全 skill の `git rev-parse` 使用箇所を列挙して確認
- [ ] `bump-semver vcs get root` のエラー時挙動を確認 (exit code / stderr 内容)
- [ ] cross-project (`--repo` 引数で別リポを指定) の場合の cwd 切り替えと新 API の組み合わせを確認
- [ ] 全 skill を置き換え + allowed-tools 更新

## 参考情報

`bump-semver vcs get root` は jj / git 両対応で抽象化された API:

```
$ bump-semver vcs get root --help
bump-semver vcs get — read a value from the VCS

Keys:
  root             Absolute path to the repository root
  backend          The detected backend: "git" or "jj"
  ...
```

**採否・実装詳細は当事者セッションで判断。本起票はフラグ + 一次資料の提示に留める。**

## 進捗ログ

- 2026-06-22 commit e3ef83c で 5/6 file 確定 (commands/{list,migrate,read,write}.md + SKILL.md)
- commands/update.md は他 dirty と同居のため kawaz 判断待ち。私の L7 削除は dirty に同梱済 (= 巻き取りで反映される)
- push は未実施 (= write/update skill の責務外)
