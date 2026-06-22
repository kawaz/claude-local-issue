# claude-local-issue justfile
# canonical task runner は kawaz/bump-semver に準拠。
# このリポは plugin (sub-commands + hooks) なので lint は JSON 妥当性 + bash 構文 + sub-command frontmatter。

set shell := ["bash", "-euo", "pipefail", "-c"]
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

# CI entry
ci: lint test

# translation pair freshness (bump-semver vcs outdated) — bump-semver があれば
[private]
check-outdated-translations:
    if command -v bump-semver >/dev/null 2>&1; then \
      bump-semver vcs outdated 'glob:**/*-ja.md' '$1/$2.md'; \
    else echo "(skip: bump-semver not found)"; fi

# bump VERSION + release commit (VERSION ファイルを持つ場合)
bump-version level="patch":
    bump-semver "$1" VERSION --write --quiet
    bump-semver vcs commit -m "Release v$(bump-semver get VERSION)" VERSION

# push with gates
push: ci check-outdated-translations
    bump-semver vcs push --branch main --jj-bookmark-auto-advance
