#!/usr/bin/env bash
# claude-local-issue: SessionStart で、カレントプロジェクトの docs/issue/ に
# 未解決 issue が一定数たまっていたら list コマンドを促す。
#
# 設計判断:
#  - matcher は `*` (全 source 発火)。alternation が source 値に効くか未検証なため、
#    分岐はスクリプトで行う。
#  - source=resume では促さない。resume はコンテキストが生きたまま復帰し、Ctrl-Z+fg 等で
#    頻発するため、促すとノイズになる。startup/clear/compact のみ促す。
#  - **件数のみで判定し、stale(放置期間)判定はしない**。stale はファイル mtime では測れず
#    (vcs 操作で mtime はあてにならない)、frontmatter TS の max で測るべきもの。その算出は
#    list コマンドに一元化する。nudge は「見にいくきっかけ」を作るだけで、質的判断は list に委ねる。
#  - 入力 parse / 出力 JSON 構築は **jq に統一** (issue-access-guard.sh と同じ哲学)。
#  - `set -e` と `pipefail` は外す: jq 非マッチで exit 1 になる経路を許容し、対象外
#    の SessionStart や不正 JSON で fail-open する。
set -u

input="$(cat)"

# source=resume は促さない
source="$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null)"
case "$source" in
  resume) exit 0 ;;
esac

# cwd → root 解決
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
root="${cwd:-${CLAUDE_PROJECT_DIR:-$PWD}}"

# threshold 環境変数の numeric validation
CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD="${CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD:-5}"
[[ "$CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD" =~ ^[0-9]+$ ]] || CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD=5

issue_dir="$root/docs/issue"
[ -d "$issue_dir" ] || exit 0

# active issue 数 (INDEX/README を除外、archive 非カウント)
count="$(find "$issue_dir" -maxdepth 1 -type f -name '*.md' \
  ! -iname 'INDEX.md' ! -iname 'README.md' ! -iname 'README-*.md' \
  2>/dev/null | wc -l | tr -d ' ')"
count="${count:-0}"

[ "$count" -ge "$CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD" ] || exit 0

msg="docs/issue/ に未解決 issue が $count 件あります (しきい値: $CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD 件)。list コマンド (/local-issue:list) で整理状況を確認することを推奨します。"

# 出力 JSON 構築も jq で
jq -n --arg msg "$msg" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$msg}}'
exit 0
