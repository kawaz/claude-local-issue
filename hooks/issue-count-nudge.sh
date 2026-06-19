#!/usr/bin/env bash
# claude-local-issue: SessionStart で、カレントプロジェクトの docs/issue/ に
# 未解決 issue が一定数たまっていたら list コマンドを促す。
#
# 設計判断:
#  - matcher は `*`(全 source 発火)。alternation が source 値に効くか未検証なため、
#    分岐はスクリプトで行う。
#  - source=resume では促さない。resume はコンテキストが生きたまま復帰し、Ctrl-Z+fg 等で
#    頻発するため、促すとノイズになる。startup/clear/compact のみ促す。
#  - **件数のみで判定し、stale(放置期間)判定はしない**。stale はファイル mtime では測れず
#    (vcs 操作で mtime はあてにならない)、frontmatter TS の max で測るべきもの。その算出は
#    list コマンドに一元化する。nudge は「見にいくきっかけ」を作るだけで、質的判断は list に委ねる。
# issue-access-guard と同じ哲学で `-e` と `pipefail` を外す
# (grep 非マッチ = source/cwd キー不在で全体が exit 1 になる事故を防ぐ、fail-open 寄り)
set -u

input="$(cat)"

source="$(printf '%s' "$input" | grep -oE '"source"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)".*/\1/')"
case "$source" in
  resume) exit 0 ;;
esac

cwd="$(printf '%s' "$input" | grep -oE '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)".*/\1/')"
root="${cwd:-${CLAUDE_PROJECT_DIR:-$PWD}}"

# threshold 環境変数の numeric validation (= 非数値や空文字で `[: -ge ...]` が落ちないよう防御)
CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD="${CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD:-5}"
[[ "$CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD" =~ ^[0-9]+$ ]] || CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD=5

issue_dir="$root/docs/issue"
[ -d "$issue_dir" ] || exit 0

COUNT_THRESHOLD="${CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD:-5}"

# 未解決 issue 件数(index/README を除く)。stale 判定はしない(= list コマンドの仕事)。
count="$(find "$issue_dir" -maxdepth 1 -type f -name '*.md' ! -iname 'INDEX.md' ! -iname 'README*.md' 2>/dev/null | wc -l | tr -d ' ')"

if [ "$count" -ge "$COUNT_THRESHOLD" ]; then
  msg="このプロジェクトに未解決 issue が ${count} 件ある。local-issue の list コマンド(/local-issue:list)で状態(status / 放置期間)を確認し、片付け・status 更新の候補がないか見ると良い。"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' \
    "$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
fi
exit 0
