# claude-local-issue justfile
# canonical task runner は kawaz/bump-semver に準拠。
# このリポは plugin (skills + hooks) なので lint は JSON 妥当性 + bash 構文 + skill frontmatter。

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
      python3 -c "import json,sys;json.load(open('$f'))" && echo "ok: $f"; \
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

# hook の実機スモークテスト
test: lint
    @echo '{"tool_name":"Read","tool_input":{"file_path":"/x/docs/issue/2026-01-01-a.md"},"cwd":"/x"}' \
      | ./hooks/issue-access-guard.sh | python3 -c "import json,sys;json.load(sys.stdin);print('access-guard ok')"

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
