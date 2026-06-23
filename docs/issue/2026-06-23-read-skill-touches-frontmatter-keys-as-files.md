---
title: read skill が frontmatter キー名を cwd に空ファイルとして touch する事故
status: open
category: bug
created: 2026-06-23T11:42:30+09:00
last_read: 2026-06-23T11:46:23+09:00
open_entered: 2026-06-23T11:42:30+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: 自リポ TODO
---

# read skill が frontmatter キー名を cwd に空ファイルとして touch する事故

## 概要

`/local-issue:read <slug>` を bump-semver リポで連続 3 件実行したところ、リポ root に **空ファイル 6 個** が同時刻で作成された。frontmatter のキー名がそのままファイル名になっており、read skill 内部の処理が cwd に touch している事故と推定される。

## 背景

以下の空ファイルがリポ root に作成された:

```
2026-06-22T22:06:01+09:00   # frontmatter の created の値
blocked_entered:
last_read:
pending_entered:
resolved_entered:
wip_entered:
```

全部 0 byte。`blocked_entered:` のようにコロン付きで作られているのが特徴的で、frontmatter キーが何らかの redirect / heredoc 経路で cwd に touch されたように見える。

### 再現環境

- 実行リポ: `~/.local/share/repos/github.com/kawaz/bump-semver/.claude/worktrees/read-issue/`
- 連続 read した 3 件:
  - `2026-06-18-vcs-worktree-promote-support` (frontmatter 欠落 = read 報告で「読み取れず」と出た issue)
  - `2026-06-22-vcs-get-current-branch-ambiguous-fallback`
  - `2026-06-22-vcs-sync-matrix-verification`

### 仮説

read skill 内部で `cat <<EOF > "$key"` や `echo "$val" > "$key:"` のような **キー名を file path として書く処理** が混入している疑い。特に value が空のキー (`wip_entered:` 等) もファイル化されてるので「frontmatter の全キーを iterate して touch」している経路がありそう。

連続 read で 6 ファイルしか作られない (= 3 件 read してるのに 1 セットしか残ってない) のは、後続が上書きしてる挙動と整合する。

1 番目の issue が frontmatter 欠落だった点が引き金 (= parse 失敗時の fallback で touch する経路) になっている可能性もある。

## 受け入れ条件

- [ ] read skill の touch 経路を特定し修正する
- [ ] 既存 active issue で frontmatter 欠落のものがあるか migrate skill で一括チェックする
- [ ] 修正後、連続 read を実行しても cwd に余計なファイルが作られないことを確認する

## スコープ

- 含む: read skill の touch 経路の特定 + 修正
- 含む: 既存 active issue で frontmatter 欠落のものがあるか migrate skill で一括チェック
- 含まない: 既に被害を受けた他リポへの clean-up (= 利用者が各自削除)
