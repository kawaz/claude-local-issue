#!/usr/bin/env bash
# claude-local-issue: 全 Read/Write/Edit/Bash で発火し、対象パスが docs/issue/ 配下の
# issue ファイルなら、command/skill(read/list/write/update)経由を促す。
#
# 設計判断:
#  - hooks.json の `if` は使わない。`if` は (a) パフォーマンス用の前段フィルタに過ぎず、
#    (b) 相対 glob が project dir 基準で解決されるためクロスプロジェクト(絶対パス/別リポ)を
#    取りこぼす。本筋のブロック/無視/誘導の分岐は stdin のパスからスクリプトで行う。
#  - exit 2 でのブロックはしない。スキル本体も Read/Write/Edit を使うため、ブロックすると
#    スキル自身が止まる。促し(additionalContext)に留め、判断は AI に委ねる。
#  - Bash 経路 (cat/head/tail/grep/sed 等での直読み・直書き) も同じ filter で nudge する。
#    AI が Skill ツール経由でなく Bash で直に触る習慣を補足するため。
# pipefail はあえて外す: grep -oE が non-match で exit 1 を返す経路を許容する
# (TaskCreate 等の対象外 tool で tool_input に file_path / command が無くても
#  early-filter までは進ませる必要があるため。set -e にしないことで non-blocking)
set -u

input="$(cat)"

tool="$(printf '%s' "$input" | grep -oE '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)".*/\1/')"

# 早期 filter: 対象外 tool は即 exit 0 (= TaskCreate / Glob / AskUserQuestion / Task 等)
case "$tool" in
  Read|Write|Edit|Bash) : ;;
  *) exit 0 ;;
esac

# tool ごとに対象 path を抽出 (= grep 非マッチで path="" になっても後段の case で素通り)
path=""
case "$tool" in
  Read|Write|Edit)
    path="$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"
    ;;
  Bash)
    # tool_input.command 全体から docs/issue/<file>.md パターンを抽出 (= 1 つ目で代表)
    cmd="$(printf '%s' "$input" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"command"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"
    path="$(printf '%s' "$cmd" | grep -oE '[^[:space:]"'"'"']*docs/issue/[^[:space:]"'"'"']+\.md' | head -1)"
    ;;
esac

# --- パスによる最終フィルタ(ここが本筋) ---
# docs/issue/ 配下の .md でなければ無関係 → 即無視
# (path は Read/Write/Edit 経路では絶対、Bash 経路では相対のこともあるため両対応)
case "$path" in
  *docs/issue/*.md) : ;;
  *) exit 0 ;;
esac
# INDEX / README はスキルが正当に触る → 促さない (docs/issue 配下に限定)
case "$path" in
  *docs/issue/INDEX.md|*docs/issue/README.md|*docs/issue/README-*.md) exit 0 ;;
esac

# tool に応じた誘導メッセージ
case "$tool" in
  Read)  msg="docs/issue/ の issue を直接 Read しようとしている。read コマンド(/local-issue:read、last_read 記録 + 放置防止の TODO 化)、一覧なら list コマンド(/local-issue:list)を使うこと。既に command/skill 経由ならこの注意は無視してよい。" ;;
  Bash)  msg="docs/issue/ の issue を Bash 経由 (cat/head/tail/grep/sed 等) で直接読もう/書こうとしている。read コマンド(/local-issue:read、last_read 記録 + 放置防止 TODO 化)、一覧なら list コマンド(/local-issue:list)、起票/更新ならそれぞれ write/update コマンドを使うこと。既に command/skill 経由ならこの注意は無視してよい。" ;;
  Write) msg="docs/issue/ に直接 Write しようとしている。起票は write スキル(/local-issue:write、category 判定・index 反映・vcs commit まで固定フロー)を使うこと。既に command/skill 経由ならこの注意は無視してよい。" ;;
  Edit)  msg="docs/issue/ を直接 Edit しようとしている。status 変更・本文更新・close は update スキル(/local-issue:update、index 反映・close 時の archive 移動と後続起票まで)を使うこと。既に command/skill 経由ならこの注意は無視してよい。" ;;
  *) exit 0 ;;
esac

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":%s}}\n' \
  "$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
exit 0
