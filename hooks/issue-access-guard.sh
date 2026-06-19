#!/usr/bin/env bash
# claude-local-issue: 全 Read/Write/Edit で発火し、対象パスが docs/issue/ 配下の
# issue ファイルなら、command/skill(read/list/write/update)経由を促す。
#
# 設計判断:
#  - hooks.json の `if` は使わない。`if` は (a) パフォーマンス用の前段フィルタに過ぎず、
#    (b) 相対 glob が project dir 基準で解決されるためクロスプロジェクト(絶対パス/別リポ)を
#    取りこぼす。本筋のブロック/無視/誘導の分岐は stdin のパスからスクリプトで行う。
#  - exit 2 でのブロックはしない。スキル本体も Read/Write/Edit を使うため、ブロックすると
#    スキル自身が止まる。促し(additionalContext)に留め、判断は AI に委ねる。
set -euo pipefail

input="$(cat)"

path="$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"

# --- パスによる最終フィルタ(ここが本筋) ---
# docs/issue/ 配下の .md でなければ無関係 → 即無視
case "$path" in
  */docs/issue/*.md) : ;;
  *) exit 0 ;;
esac
# INDEX / README はスキルが正当に触る → 促さない
case "$path" in
  */INDEX.md|*/README.md|*/README-*.md) exit 0 ;;
esac

tool="$(printf '%s' "$input" | grep -oE '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)".*/\1/')"

case "$tool" in
  Read)  msg="docs/issue/ の issue を直接 Read しようとしている。read コマンド(/local-issue:read、last_read 記録 + 放置防止の TODO 化)、一覧なら list コマンド(/local-issue:list)を使うこと。既に command/skill 経由ならこの注意は無視してよい。" ;;
  Write) msg="docs/issue/ に直接 Write しようとしている。起票は write スキル(/local-issue:write、category 判定・index 反映・vcs commit まで固定フロー)を使うこと。既に command/skill 経由ならこの注意は無視してよい。" ;;
  Edit)  msg="docs/issue/ を直接 Edit しようとしている。status 変更・本文更新・close は update スキル(/local-issue:update、index 反映・close 時の archive 移動と後続起票まで)を使うこと。既に command/skill 経由ならこの注意は無視してよい。" ;;
  *) exit 0 ;;
esac

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":%s}}\n' \
  "$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
exit 0
