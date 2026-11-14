# claude-local-issue justfile
# canonical task runner は kawaz/bump-semver に準拠。
# このリポは plugin (Claude Mods の hooks module 1 つ) なので、lint は manifest と hooks module の検査
# (claude plugin validate)、型検査、型の主張・any・非 null の主張の禁止 (oxlint)、JSON 妥当性。
# 型検査と oxlint は devDependencies を使うので、先に `bun install` しておく。

set shell := ["bash", "-euo", "pipefail", "-c"]

set script-interpreter := ["bash", "-euo", "pipefail"]

set positional-arguments

default: list

# show the recipe list
list:
    @just --list --unsorted

# manifest と hooks module (hook する event / $ の呼び出し / env の読み書き) の検査
[private]
lint-plugin:
    claude plugin validate .

# hooks module とテストの型検査。型定義は engine が mod を読み込む時に
# .claude-plugin/types/ へ書き出す (git 管理外)。hooks/ と tests/ は engine の型だけで、
# test/ (bun test) はそれに bun の型を足して検査する
[private]
[script]
lint-ts:
    if [ ! -f .claude-plugin/types/claude-code/index.d.ts ]; then
        echo "NG: .claude-plugin/types/ がありません。一度 'claude --plugin-dir .' を対話で起動するか、対話 session で '/plugin-types .' を打つと書き出されます" >&2
        exit 1
    fi
    bun x tsc -p . && echo "ok: tsc (hooks, tests)"
    bun x tsc -p test && echo "ok: tsc (test)"

# `as` (as const を除く) / any / 非 null の主張 `!` を禁じる (.oxlintrc.json)
[private]
lint-oxlint:
    bun x oxlint

# JSON 妥当性 (plugin.json / marketplace.json / hooks.json)
[private]
lint-json:
    for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json hooks/hooks.json; do \
      jq empty "$f" && echo "ok: $f"; \
    done

# 全 lint
lint: lint-json lint-plugin lint-ts lint-oxlint

# test/: hooks/issue.ts の純粋な関数 (bun test)。
# tests/: hooks/register.ts を engine の $ と代役の世界で駆動する (claude plugin test)
test: lint
    bun test ./test
    claude plugin test .

# CI entry (= 翻訳ペア freshness も含む)
ci: lint test check-outdated-translations

# translation pair freshness (bump-semver vcs outdated) — README / DESIGN の ja/en ペア
[private]
check-outdated-translations:
    if command -v bump-semver >/dev/null 2>&1; then \
      bump-semver vcs outdated 'glob:**/*-ja.md' '$1/$2.md'; \
    else echo "(skip: bump-semver not found)"; fi

# bump plugin version + release commit
# 版の正本は plugin manifest 2 つ (VERSION ファイルは持たない)。
# 2 file を同時に渡すことで、bump も get も両者の一致を検査する
# (食い違えば "version mismatch" で exit 1 = 片方だけ古い状態を commit できない)。
bump-version level="patch":
    bump-semver "$1" .claude-plugin/plugin.json .claude-plugin/marketplace.json --write --quiet
    bump-semver vcs commit -m "Release v$(bump-semver get .claude-plugin/plugin.json .claude-plugin/marketplace.json)" .claude-plugin/plugin.json .claude-plugin/marketplace.json

# fail with a sync→promote→push hint when the current bookmark / branch
# is not the default (DR-0038 adoption pattern, see bump-semver docs/decisions/DR-0038).
# We gate on the *branch* (not IsWorktree) because the jj convention used here
# places the long-lived `main` workspace as a *secondary* workspace — IsWorktree
# returns true there too, so a worktree-based gate would block legitimate pushes
# from `main`. The on-default-branch flip matches the actual question:
# "is this the bookmark I should be pushing?"
[private]
[script]
check-on-default-branch:
    if ! bump-semver vcs is on-default-branch; then
        bn=$(bump-semver vcs get default-branch)
        printf >&2 "⚠ default branch (%s) に合流してから push してください\n  1. just sync         # %s@origin に rebase\n  2. just promote      # %s bookmark を current commit に forward\n  3. %s ワークスペースに移動して just push\n" "$bn" "$bn" "$bn" "$bn"
        exit 1
    fi

# 現在の worktree を default branch (= origin/<default>) に rebase (DR-0038)
sync:
    bump-semver vcs sync --onto $(bump-semver vcs get default-branch)@origin

# default branch を現在の commit に forward (DR-0038、push しない)
promote:
    bump-semver vcs promote

# push with gates (= check-on-default-branch を最初に置いて、worktree 違いなら lint 等を回さず即終了)
push: check-on-default-branch ci
    bump-semver vcs push --branch main --jj-bookmark-auto-advance
