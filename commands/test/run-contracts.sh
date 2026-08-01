#!/usr/bin/env bash
# sub-command 契約テスト (= justfile の `just test` から呼ばれる)
#
# commands/*.md は LLM への指示書なので「振る舞いそのもの」は再実行できない。
# ここで固定するのは 2 種類だけ:
#
#   A. VCS fixture — command が依存している VCS の実挙動 (close の 3 path commit と
#      `bump-semver vcs is clean` による旧 path 省略検出) を temp git repo で実機確認
#   B. 静的 invariant — 指示書が壊れると即事故になる文言 (実行 task block が 1 つ、
#      $ARGUMENTS が 1 箇所、入力補完禁止 / 未知 token reject、INDEX 正本参照)
#
# INDEX の canonical 順序判定ロジックは commands/test/check-index-order.sh
# (良/悪 fixture で本 script が検証する。live INDEX への適用は `just check-index-order`)。
set -u

cd "$(dirname "$0")/../.."
repo_root=$PWD

pass=0
fail=0

ok() { pass=$((pass + 1)); echo "PASS [$1]"; }
ng() { fail=$((fail + 1)); echo "FAIL [$1] $2"; }

# ---- 静的 assert helper ------------------------------------------------------

assert_count() {
  local label="$1" file="$2" pattern="$3" want="$4" got
  got=$(grep -c -- "$pattern" "$file" || true)
  if [ "$got" = "$want" ]; then ok "$label"; else ng "$label" "expected $want match(es) of '$pattern' in $file, got $got"; fi
}

assert_grep() {
  local label="$1" file="$2" pattern="$3"
  if grep -q -- "$pattern" "$file"; then ok "$label"; else ng "$label" "missing '$pattern' in $file"; fi
}

# ---- A. close commit contract (temp git fixture) -----------------------------

echo "=== close: 3 path commit + is clean (git fixture) ==="

fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT

setup_fixture() {
  local slug="$1"
  rm -rf "$fixture/repo"
  mkdir -p "$fixture/repo/docs/issue/archive"
  cd "$fixture/repo"
  git init -q . >/dev/null 2>&1
  git config user.email test@example.com
  git config user.name test
  git config commit.gpgsign false
  printf '# %s\n' "$slug" > "docs/issue/$slug.md"
  printf '# Issue INDEX\n\n| date | category | status | slug | 概要 |\n|---|---|---|---|---|\n| 2026-01-01 | bug | open | [%s](./%s.md) | x |\n' "$slug" "$slug" > docs/issue/INDEX.md
  git add -A
  git commit -qm init
}

# close 相当の物理移動 + INDEX からの行除去
do_close_move() {
  local slug="$1"
  mv "docs/issue/$slug.md" "docs/issue/archive/$slug.md"
  grep -v "\[$slug\]" docs/issue/INDEX.md > docs/issue/INDEX.md.tmp
  mv docs/issue/INDEX.md.tmp docs/issue/INDEX.md
}

# case 1: 3 path すべてを指定 → commit 後 clean
setup_fixture close-ok
do_close_move close-ok
if bump-semver vcs commit -q -m "issue(close): close-ok -> archive" \
  docs/issue/close-ok.md docs/issue/archive/close-ok.md docs/issue/INDEX.md >/dev/null 2>&1; then
  if bump-semver vcs is clean >/dev/null 2>&1; then
    ok "3 path close commit leaves worktree clean"
  else
    ng "3 path close commit leaves worktree clean" "worktree dirty after 3-path commit: $(git status --porcelain)"
  fi
else
  ng "3 path close commit leaves worktree clean" "bump-semver vcs commit failed"
fi

# 旧 path が commit 内で消えていること (git は移動を rename R100 に畳むので D / R の
# どちらでもよい。契約は「旧 path が commit 後に tracked のまま残らない」こと)
if git show --name-status --format= HEAD | grep -qE '^(D|R[0-9]*)[[:space:]]+docs/issue/close-ok\.md([[:space:]]|$)'; then
  ok "old path is removed by the close commit"
else
  ng "old path is removed by the close commit" "no delete/rename entry: $(git show --name-status --format= HEAD | tr '\n' ' ')"
fi
if git ls-tree -r --name-only HEAD | grep -qx 'docs/issue/close-ok.md'; then
  ng "old path is untracked at HEAD after close" "docs/issue/close-ok.md still tracked at HEAD"
else
  ok "old path is untracked at HEAD after close"
fi

# case 2: 旧 path を省略 → `is clean` が dirty として検出する (= command の検証手順が効く)
setup_fixture close-drop
do_close_move close-drop
bump-semver vcs commit -q -m "issue(close): close-drop -> archive" \
  docs/issue/archive/close-drop.md docs/issue/INDEX.md >/dev/null 2>&1 || true
if bump-semver vcs is clean >/dev/null 2>&1; then
  ng "omitting old path is detected as dirty" "is clean returned success though the deletion was dropped"
else
  ok "omitting old path is detected as dirty"
fi

cd "$repo_root"

assert_grep "update.md requires all 3 paths in close commit" commands/update.md '3 path すべて必須'
assert_grep "update.md forbids --allow-nonexistent-path" commands/update.md 'allow-nonexistent-path'
assert_grep "update.md mandates post-commit 'vcs is clean'" commands/update.md 'bump-semver vcs is clean'

# ---- B. INDEX canonical order ------------------------------------------------

echo ""
echo "=== INDEX: canonical order (template = 正本) ==="

assert_grep "index template declares the 5-column header" templates/index.md '| date | category | status | slug | 概要 |'
assert_grep "index template declares status priority order" templates/index.md 'idea → open → wip → blocked → pending-sublimation'
assert_grep "index template declares date desc within a status" templates/index.md 'date 降順'

for f in commands/write.md commands/update.md; do
  assert_grep "$(basename "$f") points at templates/index.md as 正本" "$f" 'templates/index.md'
  assert_grep "$(basename "$f") forbids reordering other rows" "$f" '既存の他の行の順序・内容は変えない'
done

# 順序チェッカ自身の良/悪 fixture (= checker が壊れたら静かに素通りするのを防ぐ)
good_index="$fixture/good-INDEX.md"
bad_index="$fixture/bad-INDEX.md"
{
  printf '| date | category | status | slug | 概要 |\n|---|---|---|---|---|\n'
  printf '| 2026-02-01 | idea | idea | [a](./a.md) | x |\n'
  printf '| 2026-03-01 | bug | open | [b](./b.md) | x |\n'
  printf '| 2026-01-01 | bug | open | [c](./c.md) | x |\n'
  printf '| 2026-01-01 | task | wip | [d](./d.md) | x |\n'
} > "$good_index"
{
  printf '| date | category | status | slug | 概要 |\n|---|---|---|---|---|\n'
  printf '| 2026-01-01 | bug | open | [b](./b.md) | x |\n'
  printf '| 2026-02-01 | idea | idea | [a](./a.md) | x |\n'
} > "$bad_index"

if bash commands/test/check-index-order.sh "$good_index" >/dev/null 2>&1; then
  ok "order checker accepts a canonical INDEX"
else
  ng "order checker accepts a canonical INDEX" "checker rejected the good fixture"
fi
if bash commands/test/check-index-order.sh "$bad_index" >/dev/null 2>&1; then
  ng "order checker rejects a mis-ordered INDEX" "checker accepted the bad fixture"
else
  ok "order checker rejects a mis-ordered INDEX"
fi

# ---- C. 入力契約 (実行 task block / $ARGUMENTS / reject) ----------------------

echo ""
echo "=== commands: input contract ==="

for f in commands/read.md commands/list.md commands/migrate.md commands/write.md commands/update.md; do
  b=$(basename "$f")
  assert_count "$b has exactly one 実行 task block" "$f" '^## 実行 task' 1
  assert_count "$b substitutes \$ARGUMENTS exactly once" "$f" '\$ARGUMENTS' 1
  assert_grep "$b declares the argument line as the only input" "$f" '唯一の入力'
  assert_grep "$b forbids completing input from context" "$f" '補完しない'
  assert_grep "$b rejects unknown token / flag" "$f" 'reject'
done

# 引数必須 command は空引数を reject、既定操作を持つ command は空でも実行する
for f in commands/read.md commands/update.md commands/write.md; do
  assert_grep "$(basename "$f") rejects an empty argument line" "$f" '即 reject'
done
for f in commands/list.md commands/migrate.md; do
  assert_grep "$(basename "$f") runs its default operation on empty args" "$f" '既定操作を実行する'
done

echo ""
echo "=== commands: --repo root resolution ==="

# リポ名は canonical main 専用 (= 名前は workspace 識別子を持たない)。worktree /
# workspace を対象にする経路は絶対パスだけ、という仕様が全 command と正本 (SKILL.md)
# に残っていることを固定する。
for f in commands/read.md commands/list.md commands/migrate.md commands/write.md commands/update.md SKILL.md; do
  b=$(basename "$f")
  assert_grep "$b pins a repo name to <name>/main" "$f" 'リポ名は必ず'
  assert_grep "$b sends worktree / workspace targets to an absolute path" "$f" '絶対パスを渡す'
done

# root は候補を選んだ後に必ず VCS root へ正規化する (update.md も他 4 command と同粒度)
for f in commands/read.md commands/list.md commands/migrate.md commands/write.md commands/update.md; do
  assert_grep "$(basename "$f") normalizes the root via vcs get root" "$f" 'bump-semver vcs get root'
done

echo ""
echo "=== Summary: $pass pass, $fail fail ==="
[ $fail = 0 ]
