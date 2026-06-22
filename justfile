# claude-local-issue justfile
# canonical task runner は kawaz/bump-semver に準拠。
# このリポは plugin (sub-commands + hooks) なので lint は JSON 妥当性 + bash 構文 + sub-command frontmatter。

set shell := ["bash", "-euo", "pipefail", "-c"]

set script-interpreter := ["bash", "-euo", "pipefail"]

set positional-arguments

default: list

# show the recipe list
list:
    @just --list --unsorted

# JSON 妥当性 (plugin.json / marketplace.json / hooks.json)
[private]
lint-json:
    for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json hooks/hooks.json; do \
      jq empty "$f" && echo "ok: $f"; \
    done

# hook script の bash 構文チェック
[private]
lint-sh:
    for f in hooks/*.sh; do bash -n "$f" && echo "ok: $f"; done

# SKILL.md (plugin root) と commands/*.md に frontmatter (--- 開始) があるか
[private]
lint-skills:
    for f in SKILL.md commands/*.md; do head -1 "$f" | grep -qx -- '---' && echo "ok: $f" || { echo "NG frontmatter: $f"; exit 1; }; done

# 全 lint
lint: lint-json lint-sh lint-skills

# hook の実機スモークテスト (= jq ベース hook の正値 + 負値 + bypass マトリクス、9+ ケース)
test: lint
    @bash hooks/test/run-matrix.sh

# CI entry (= 翻訳ペア freshness も含む)
ci: lint test check-outdated-translations

# translation pair freshness (bump-semver vcs outdated) — README / DESIGN の ja/en ペア
[private]
check-outdated-translations:
    if command -v bump-semver >/dev/null 2>&1; then \
      bump-semver vcs outdated 'glob:**/*-ja.md' '$1/$2.md'; \
    else echo "(skip: bump-semver not found)"; fi

# bump VERSION + release commit (VERSION ファイルを持つ場合)
bump-version level="patch":
    bump-semver "$1" VERSION --write --quiet
    bump-semver vcs commit -m "Release v$(bump-semver get VERSION)" VERSION

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
        cur=$(bump-semver vcs get current-branch 2>/dev/null || echo "(ambiguous)")
        bn=$(bump-semver vcs get default-branch)
        printf >&2 "⚠ 現在 '%s' bookmark/branch にいます。%s に合流してから push してください\n  1. just sync         # %s@origin に rebase\n  2. just promote      # %s bookmark を current commit に forward\n  3. %s ワークスペースに移動して just push\n" "$cur" "$bn" "$bn" "$bn" "$bn"
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
