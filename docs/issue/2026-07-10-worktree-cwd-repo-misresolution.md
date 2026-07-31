---
title: --repo のリポ名指定では main 固定となり worktree / workspace を選べない
status: open
category: bug
created: 2026-07-10T12:22:19+09:00
last_read:
open_entered: 2026-07-10T12:22:19+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: LaserGuideV3 (クロスプロジェクト起票、部外者フラグ)
---

# --repo のリポ名指定では main 固定となり worktree / workspace を選べない

## 判明した事実

- `list` / `migrate` / `read` / `write` の root 解決は、`--repo <name>` を
  `$HOME/.local/share/repos/github.com/kawaz/<name>/main` に変換してから
  `bump-semver vcs get root` で正規化する。リポ名だけでは同じリポの別
  worktree / workspace を指定できない。
- `--repo <absolute-path>` は指定先を候補 root にするため、git worktree と
  jj workspace のどちらも正しい workspace root を得られる。
- `--repo` 省略時は `$CLAUDE_PROJECT_DIR`、未設定なら cwd を候補 root にする。
  候補が worktree / workspace 内なら正しく解決し、別リポを指していればその
  別リポを解決する。この調査 worker の実行環境では `CLAUDE_PROJECT_DIR` は
  未設定だった。
- `bump-semver vcs get root` は git linked worktree と jj workspace を識別する。
  subdirectory から実行しても、それぞれ現在の workspace root を返した。
  main / common repository へ誤って寄せる挙動は再現しなかった。
- `update.md` は `--repo` 省略時を「カレントプロジェクト」、絶対パスを
  `realpath` と規定する一方、リポ名の変換と `bump-semver` 正規化を固定フローに
  明記していない。plugin 全体の path 規約は `SKILL.md` にあるが、command 単体の
  root 解決仕様は他の 4 command より不足している。

したがって再現する誤認条件は、対象が別 worktree / workspace なのに
`--repo <name>` を使う場合、または `--repo` を省略して
`$CLAUDE_PROJECT_DIR` / cwd が別リポを指す場合である。有効な絶対パスが候補 root
として採用された後に cwd が優先される現象は再現しなかった。

## command ごとの root 解決経路

| command | `--repo <name>` | `--repo <absolute-path>` | 省略時 | VCS root 正規化 |
|---|---|---|---|---|
| `list` | `<repo-store>/<name>/main` | そのまま | `$CLAUDE_PROJECT_DIR`、未設定なら cwd | 明記あり |
| `migrate` | `<repo-store>/<name>/main` | そのまま | `$CLAUDE_PROJECT_DIR`、未設定なら cwd | 明記あり |
| `read` | `<repo-store>/<name>/main` | そのまま | `$CLAUDE_PROJECT_DIR`、未設定なら cwd | 明記あり |
| `write` | `<repo-store>/<name>/main` | `realpath` | `$CLAUDE_PROJECT_DIR`、未設定なら cwd | 明記あり |
| `update` | command 固定フローには変換規則なし | `realpath` | カレントプロジェクト | command 固定フローには明記なし |

`SKILL.md` の plugin 全体規約は、リポ名を `<repo-store>/<name>/main`、絶対パスを
無条件採用、省略時を `$CLAUDE_PROJECT_DIR` とし、最後に
`cd <root> && bump-semver vcs get root` で正規化すると定めている。

## 実測マトリクス

検証時の fixture root は `<tmp>` と省略する。使用したバージョンは
`bump-semver v0.48.1`、`jj 0.43.0`。

### VCS root の正規化

実行形:

```sh
cd <candidate-or-subdirectory>
bump-semver vcs get root
```

| VCS / cwd | 実出力 | 判定 |
|---|---|---|
| git main `<tmp>/git-repo/main` | `<tmp>/git-repo/main` | main root |
| git linked worktree `<tmp>/git-repo/topic-worktree` | `<tmp>/git-repo/topic-worktree` | worktree root |
| git linked worktree の `subdir` | `<tmp>/git-repo/topic-worktree` | worktree root |
| jj main workspace `<tmp>/jj-repo/main` | `<tmp>/jj-repo/main` | main workspace root |
| jj workspace `<tmp>/jj-repo/topic-workspace` | `<tmp>/jj-repo/topic-workspace` | workspace root |
| jj workspace の `subdir` | `<tmp>/jj-repo/topic-workspace` | workspace root |

`git rev-parse --show-toplevel` と `jj root` も同じ値を返した。

### 初期候補 root と正規化結果

実行形:

```sh
root=<command の規則で選んだ候補>
cd "$root"
bump-semver vcs get root
```

| 意図する対象 | 指定条件 | 候補 root | 実出力 | 結果 |
|---|---|---|---|---|
| git linked worktree | `--repo claude-local-issue` | `<repo-store>/claude-local-issue/main` | `<repo-store>/claude-local-issue/main` | main を選び、意図した worktree へ到達しない |
| git linked worktree | `--repo <absolute-worktree-path>` | `<tmp>/topic-worktree` | `<tmp>/topic-worktree` | 正しい |
| git linked worktree | 省略、`CLAUDE_PROJECT_DIR=<tmp>/topic-worktree` | `<tmp>/topic-worktree` | `<tmp>/topic-worktree` | 正しい |
| git linked worktree | 省略、`CLAUDE_PROJECT_DIR=<repo-store>/claude-local-issue/main` | `<repo-store>/claude-local-issue/main` | `<repo-store>/claude-local-issue/main` | main を選ぶ |
| jj workspace | 省略、`CLAUDE_PROJECT_DIR=<tmp>/jj-repo/topic-workspace` | `<tmp>/jj-repo/topic-workspace` | `<tmp>/jj-repo/topic-workspace` | 正しい |
| VCS 外の cwd | 省略、`CLAUDE_PROJECT_DIR` 未設定 | VCS 外の cwd | `bump-semver: not a git or jj repository (...)` | 誤った VCS root へ黙って寄せず失敗 |

fixture は検証後に削除し、実リポに一時追加した detached worktree も
`git worktree remove --force` 後に `git worktree list` から消えたことを確認した。

## 最小再現

`<name>` の canonical main と別 worktree が存在する状態で、command の規則を
そのまま適用する。

```sh
intended=/private/tmp/topic-worktree
root="$HOME/.local/share/repos/github.com/kawaz/<name>/main" # --repo <name>
cd "$root"
bump-semver vcs get root
```

実出力は `<repo-store>/<name>/main` であり、`$intended` にはならない。
`root=$intended` とする絶対パス指定では実出力も `$intended` になる。

## 原因

原因は `bump-semver` の worktree / workspace 判定ではなく、その前段の候補 root
選択にある。`--repo <name>` は workspace 識別子を持たず canonical `main` へ
一意変換されるため、後段の `bump-semver` は main 内で実行され、正しく main root
を返す。`bump-semver` には呼び出し側が意図した別 workspace を復元する情報がない。

別 cwd からの利用で worktree を対象にするには、絶対パスが command の入力として
保持される必要がある。絶対パスが失われた場合の fallback は
`$CLAUDE_PROJECT_DIR` / cwd なので、呼び出し元リポを対象にする。元報告の正確な
引数列は一次記録がなく、旧 plugin cache の command invoke も今回禁止されているため、
元報告で絶対パスが失われた箇所までは確定していない。

## 対応範囲

この issue は再現と原因特定まで完了した。修正では、少なくとも次を満たす必要がある。

- worktree / workspace を対象にする場合、絶対パスを root 選択まで保持する。
- リポ名指定を canonical `main` 専用として維持するなら、その制約を interface 上で
  明確にする。別 workspace も名前で選べる仕様にするなら、workspace を識別できる
  入力形式を別途設計する。
- `update.md` の root 解決を他 command と同じ粒度で明記し、command 単体でも
  fallback を推測させない。

## 受け入れ条件

- [x] git linked worktree + 別 cwd の組合せで誤認条件を確認した
- [x] jj workspace + 別 cwd の組合せで root 解決を確認した
- [x] `--repo` のリポ名 / 絶対パス / 省略を比較した
- [x] 原因が候補 root 選択であり、`bump-semver` 正規化ではないことを確認した
- [x] 再現しない条件と検証範囲を記録した
- [x] 対応に必要な仕様判断を記録した
