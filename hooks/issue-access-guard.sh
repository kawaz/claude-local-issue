#!/usr/bin/env bash
# claude-local-issue: 全 Read/Write/Edit/Bash で発火し、対象パスが docs/issue/ 配下の
# issue ファイルなら、command (read/list/write/update) 経由を促す。
#
# 設計判断:
#  - hooks.json の `if` は使わない。`if` は (a) パフォーマンス用の前段フィルタに過ぎず、
#    (b) 相対 glob が project dir 基準で解決されるためクロスプロジェクト (絶対パス/別リポ)
#    を取りこぼす。本筋のブロック/無視/誘導の分岐は stdin の JSON 構造から判定する。
#  - 入力 parse / 出力 JSON 構築は **jq に統一**。grep + sed で JSON を擬似 parse する
#    と JSON エスケープされた `\"` 内の path 取りこぼし、tool_input 内の `"tool_name"`
#    リテラル誤判定が起きる (= 監査で指摘された bypass、v0.2.5 で解消)。
#  - exit 2 でのブロックはしない。command 本体も Read/Write/Edit を使うため、ブロック
#    すると command 自身が止まる。促し (additionalContext) に留め、判断は AI に委ねる。
#  - `set -e` と `pipefail` は外す: jq 非マッチで exit 1 になる経路を許容し、対象外
#    tool / 不正 JSON で fail-open する (= TaskCreate 等の対象外 tool で hook error が
#    出ない、Security 監査 W3 の挙動とも整合)。
#  - **known limitation**: Bash 経路の `command` 値内の path 抽出は依然 regex (= shell
#    の quoting / 変数展開を理解しない)。複合コマンド・heredoc・変数経由パスは検出
#    できない。high-fidelity enforcement は scope 外、advisory として動作する。
set -u

input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"

# 対象外 tool は即無視 (= TaskCreate / Glob / AskUserQuestion 等)
case "$tool" in
  Read|Write|Edit|Bash) : ;;
  *) exit 0 ;;
esac

# tool ごとに対象 path を抽出
path=""
case "$tool" in
  Read|Write|Edit)
    path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
    ;;
  Bash)
    cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
    # コマンド先頭が「読み書き系」のときのみ docs/issue/<file>.md を抽出。
    # cmux-msg / git commit -m / git log 等で path 文字列を引用しただけで誤発火しない
    # ようにするための first-token filter。known limitation: 複合コマンドは検出外。
    head_cmd="$(printf '%s' "$cmd" | sed -E 's/^[[:space:]]+//' | grep -oE '^[a-zA-Z][a-zA-Z0-9_./+-]*' | head -1)"
    case "$head_cmd" in
      cat|head|tail|less|more|bat|view|nl|tac|rev|wc|file|stat|grep|fgrep|egrep|rg|ag|ack|sed|awk|cut|paste|sort|uniq|jq|yq|nano|vim|vi|emacs|cp|mv|rm|chmod|chown|touch|truncate|tee|ln)
        path="$(printf '%s' "$cmd" | grep -oE '[^[:space:]"'"'"']*docs/issue/[^[:space:]"'"'"']+\.md' | head -1)"
        ;;
      *)
        exit 0
        ;;
    esac
    ;;
esac

# パスによる最終フィルタ (= 本筋)
# docs/issue/ 配下の .md でなければ無関係 → 即無視
# (Read/Write/Edit は絶対パス、Bash は相対のこともあるため両対応)
case "$path" in
  *docs/issue/*.md) : ;;
  *) exit 0 ;;
esac
# archive 配下は過去経緯参照として直接アクセス OK → 促さない (= read しっぱなしで良い、仕様 SKILL.md と整合)
case "$path" in
  *docs/issue/archive/*) exit 0 ;;
esac
# INDEX / README は command が正当に触る → 促さない
case "$path" in
  *docs/issue/INDEX.md|*docs/issue/README.md|*docs/issue/README-*.md) exit 0 ;;
esac

# tool に応じた誘導メッセージ
case "$tool" in
  Read)  msg="docs/issue/ の issue を直接 Read しようとしている。read コマンド (/local-issue:read、last_read 記録 + 放置防止の TODO 化)、一覧なら list コマンド (/local-issue:list) を使うこと。既に command 経由ならこの注意は無視してよい。" ;;
  Bash)  msg="docs/issue/ の issue を Bash 経由 (cat/head/tail/grep/sed 等) で直接読もう / 書こうとしている。read コマンド (/local-issue:read、last_read 記録 + 放置防止 TODO 化)、一覧なら list コマンド (/local-issue:list)、起票 / 更新ならそれぞれ write/update コマンドを使うこと。既に command 経由ならこの注意は無視してよい。" ;;
  Write) msg="docs/issue/ に直接 Write しようとしている。起票は write コマンド (/local-issue:write、category 判定・INDEX 反映・vcs commit まで固定フロー) を使うこと。既に command 経由ならこの注意は無視してよい。" ;;
  Edit)  msg="docs/issue/ を直接 Edit しようとしている。status 変更・本文更新・close は update コマンド (/local-issue:update、INDEX 反映・close 時の archive 移動と後続起票まで) を使うこと。既に command 経由ならこの注意は無視してよい。" ;;
  *) exit 0 ;;
esac

# 出力 JSON 構築も jq で正しくエスケープ (= --arg 経由、shell quoting に依存しない)
jq -n --arg msg "$msg" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$msg}}'
exit 0
