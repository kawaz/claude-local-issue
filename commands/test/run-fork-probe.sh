#!/usr/bin/env bash
# fork 入力契約の live probe (= `just probe-fork`、`just test` からは呼ばれない)
#
# commands/*.md は LLM への指示書なので、run-contracts.sh が固定できるのは
# 「指示書の文言」までで、fork 先 subagent が実際に契約どおり動くかは測れない。
# 本 script は使い捨ての temp repo に fixture を置き、`claude -p '/local-issue:<cmd> <args>'`
# を実プロセスで叩いて **空振り** (= フローを 1 歩も実行せず質問して終了する失敗モード)
# を機械検出する。
#
# `just test` に入れていない理由:
#   - 1 run あたり実 model 呼び出し 1 セッション (= 課金 + 数十秒)。15 条件で数分かかる
#   - 判定対象が確率的なので、CI に入れると本質的に flaky になる
#   - 指示書 (commands/*.md) を編集した時にだけ再測すれば足りる
#
# 使い方:
#   bash commands/test/run-fork-probe.sh [--reps N] [--parallel N] [--keep]
#
# 判定:
#   - 副作用のある条件 (read/write/update/migrate の正常系) は commit の有無で判定する
#   - 副作用のない条件 (list、--dry-run) は出力マーカーと repo 無変更で判定する
#   - reject 系は repo 無変更で判定する
#   空振りはどちらの経路でも fail になる (= 何も実行せず質問だけして終わるため)。
#
# FAIL は「契約どおりに完遂しなかった」であって「空振り」限定ではない。実測 (45 run) では
# 空振り 0 に対し、指定外の手段でフローを進めて途中で止まる形の逸脱が数 % 出る。
# 率で語りたい時は --reps を上げる (= 1 run は sample 数 1)。
#
# 要 bash 4.3+ (`wait -n`)。
set -u

cd "$(dirname "$0")/../.."
repo_root=$PWD

reps=1
parallel=5
keep=0
while [ $# -gt 0 ]; do
  case "$1" in
    --reps) reps="$2"; shift 2 ;;
    --parallel) parallel="$2"; shift 2 ;;
    --keep) keep=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v claude >/dev/null 2>&1 || { echo "skip: claude CLI not found"; exit 0; }

# サンドボックス親には run dir 以外を置かない。fork 先 subagent は Read / ls を持つので、
# probe の条件表や log が祖先ディレクトリにあると、それを読んで「正解」を得てしまう。
work=$(mktemp -d)
sandbox="$work/sbx"
logs="$work/logs"
mkdir -p "$sandbox" "$logs"
[ "$keep" = 1 ] || trap 'rm -rf "$work"' EXIT

# ---- fixture ----------------------------------------------------------------

fixture="$work/fixture"
mkdir -p "$fixture/docs/issue/archive"

issue() {
  local file="$1" title="$2" status="$3" category="$4" date="$5" wip="$6" summary="$7"
  cat > "$fixture/docs/issue/$file" <<EOF
---
title: $title
status: $status
category: $category
created: ${date}T10:00:00+09:00
last_read:
open_entered: ${date}T10:00:00+09:00
wip_entered: $wip
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: fixture
---

# $title

## 概要

$summary
EOF
}

issue 2026-07-01-alpha-issue.md "alpha の不具合" open bug 2026-07-01 "" "alpha コマンドが落ちる。"
issue 2026-07-05-beta-issue.md "beta の実装" wip task 2026-07-05 "2026-07-06T10:00:00+09:00" "beta 機能を実装する。"

# migrate に仕事を作るための旧形式 (frontmatter 欠落)
cat > "$fixture/docs/issue/2026-07-12-legacy-note.md" <<'EOF'
# legacy 形式のメモ

status: open

## 概要

frontmatter を持たない旧形式の issue。
EOF

cat > "$fixture/docs/issue/INDEX.md" <<'EOF'
# Issue INDEX

| date | category | status | slug | 概要 |
|---|---|---|---|---|
| 2026-07-01 | bug | open | [alpha-issue](./2026-07-01-alpha-issue.md) | alpha コマンドが落ちる。 |
| 2026-07-05 | task | wip | [beta-issue](./2026-07-05-beta-issue.md) | beta 機能を実装する。 |
EOF

# fixture repo であることを名前から悟らせない (= 「これはテストだ」と読まれると挙動が変わる)
printf '# sample-project\n\nサンプルプロジェクト。\n' > "$fixture/README.md"
(
  cd "$fixture"
  git init -q .
  git config user.email probe@example.com
  git config user.name probe
  git config commit.gpgsign false
  git add -A
  git commit -qm initial
)

# ---- 条件表 -----------------------------------------------------------------
#
# label | cmd | expect | marker | args
#
# 区切りは `|`。tab は IFS whitespace なので連続 tab が 1 つに畳まれ、
# 空の marker 列が消えて args 列とずれる (= 実測で踏んだ)。
#
#   expect=commit  … 副作用のある正常系。fixture commit の上に commit が積まれること。
#                    空振りはここで確実に落ちる (commit が 1 のまま)
#   expect=output  … 読み専 / dry-run の正常系。repo は無変更のまま、出力に marker が
#                    現れること。副作用がないので、空振りは marker の不在で検出する
#   expect=noop    … reject 系。commit が積まれず worktree も clean なこと
#                    (= 逆向きの失敗「reject すべき入力で実行してしまう」を見る)

conditions() {
  printf '%s\n' \
    "read-normal|read|commit||alpha-issue" \
    "read-empty|read|noop||" \
    "read-garbage|read|noop||--frobnicate zzz" \
    "list-normal|list|output|alpha-issue|--status open" \
    "list-empty|list|output|beta-issue|" \
    "list-garbage|list|noop||--frobnicate" \
    "write-normal|write|commit||delta-issue probe 用の起票。本文はこの 1 文。" \
    "write-empty|write|noop||" \
    "write-garbage|write|noop||epsilon-issue 本文テキスト --frobnicate" \
    "update-normal|update|commit||alpha-issue --status wip" \
    "update-empty|update|noop||" \
    "update-garbage|update|noop||alpha-issue --frobnicate" \
    "migrate-normal|migrate|output|legacy-note|--dry-run" \
    "migrate-empty|migrate|commit||" \
    "migrate-garbage|migrate|noop||--frobnicate"
}

# ---- 1 run ------------------------------------------------------------------

run_one() {
  local label="$1" cmd="$2" expect="$3" marker="$4" args="$5" wid="$6"
  local dir="$sandbox/$wid" log="$logs/$label.log" prompt
  cp -a "$fixture" "$dir"
  if [ -n "$args" ]; then prompt="/local-issue:$cmd $args"; else prompt="/local-issue:$cmd"; fi

  # stdin は必ず /dev/null。開いたままだと `claude -p` が stdin を読んで prompt に
  # 連結し、$ARGUMENTS に混入する (= 引数条件が壊れて probe が無意味になる)。
  (
    cd "$dir" || exit 1
    printf '### %s\n### PROMPT: %s\n' "$label" "$prompt" > "$log"
    timeout 600 claude -p "$prompt" --permission-mode acceptEdits < /dev/null >> "$log" 2>&1
  )

  local commits dirty verdict
  commits=$(cd "$dir" && git rev-list --count HEAD)
  dirty=$(cd "$dir" && git status --porcelain)
  {
    echo "### commits=$commits"
    echo "### dirty=${dirty:-(clean)}"
  } >> "$log"

  local marker_hit=n
  grep -q -- "$marker" "$log" 2>/dev/null && marker_hit=y
  case "$expect" in
    commit) [ "$commits" -ge 2 ] && verdict=PASS || verdict=FAIL ;;
    output) [ -n "$marker" ] && [ "$commits" = 1 ] && [ -z "$dirty" ] && [ "$marker_hit" = y ] && verdict=PASS || verdict=FAIL ;;
    noop)   [ "$commits" = 1 ] && [ -z "$dirty" ] && verdict=PASS || verdict=FAIL ;;
    *) verdict=FAIL ;;
  esac
  printf '%s\t%s\t%s\n' "$verdict" "$label" \
    "expect=$expect commits=$commits dirty=${dirty:+yes} marker=${marker:-(none)}:$marker_hit" \
    > "$logs/$label.verdict"
}

# ---- driver -----------------------------------------------------------------

echo "=== fork input contract probe (reps=$reps, parallel=$parallel) ==="
i=0
for rep in $(seq 1 "$reps"); do
  while IFS='|' read -r label cmd expect marker args; do
    [ -z "${label:-}" ] && continue
    i=$((i + 1))
    run_one "$label-$rep" "$cmd" "$expect" "${marker-}" "${args-}" "$(printf 'w%03d' "$i")" < /dev/null &
    while [ "$(jobs -rp | wc -l)" -ge "$parallel" ]; do wait -n; done
  done < <(conditions)
done
wait

pass=0
fail=0
for v in "$logs"/*.verdict; do
  line=$(cat "$v")
  case "$line" in
    PASS*) pass=$((pass + 1)) ;;
    *) fail=$((fail + 1)); echo "$line" ;;
  esac
done

echo ""
echo "=== Summary: $pass pass, $fail fail (logs: $logs) ==="
[ "$keep" = 1 ] && echo "(--keep: $work は残しています)"
cd "$repo_root"
[ "$fail" = 0 ]
