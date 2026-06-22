#!/usr/bin/env bash
# hook smoke test matrix (= justfile の `just test` から呼ばれる)
#
# v0.2.5 で hook を jq ベース構造化 parse に置換。旧 grep+sed bug
# (= JSON escape 内 path 取りこぼし、tool_input 内のリテラル誤判定) が
# 解消されていることを CI で固定するためのマトリクス。
#
# 正常系・bypass・false positive 緩和・対象外 tool fail-open・不正 JSON fail-open
# を 1 つの script でまとめて検証する。
set -u

cd "$(dirname "$0")/../.."

pass=0
fail=0

run_test() {
  local label="$1"; local json="$2"; local expect="$3"
  local out exit_code
  out=$(printf '%s' "$json" | ./hooks/issue-access-guard.sh 2>&1)
  exit_code=$?
  if [ "$expect" = "silent" ]; then
    if [ -z "$out" ] && [ $exit_code = 0 ]; then
      pass=$((pass+1))
      echo "PASS [$label]"
    else
      fail=$((fail+1))
      echo "FAIL [$label] exit=$exit_code out=$out"
    fi
  else
    if [ -n "$out" ] && [ $exit_code = 0 ]; then
      pass=$((pass+1))
      echo "PASS [$label] (nudge fired)"
    else
      fail=$((fail+1))
      echo "FAIL [$label] expected nudge, got exit=$exit_code out=$out"
    fi
  fi
}

run_test_sst() {
  local label="$1"; local json="$2"; local exp_code="$3"
  local out ec
  out=$(printf '%s' "$json" | ./hooks/issue-count-nudge.sh 2>&1)
  ec=$?
  if [ $ec = $exp_code ]; then
    pass=$((pass+1))
    echo "PASS [SessionStart $label] exit=$ec"
  else
    fail=$((fail+1))
    echo "FAIL [SessionStart $label] expected exit=$exp_code got=$ec out=$out"
  fi
}

echo "=== PreToolUse: issue-access-guard.sh ==="

# 正常系 (nudge 期待)
run_test "Read active issue" '{"tool_name":"Read","tool_input":{"file_path":"/x/docs/issue/foo.md"},"cwd":"/x"}' nudge
run_test "Write active issue" '{"tool_name":"Write","tool_input":{"file_path":"/x/docs/issue/foo.md"},"cwd":"/x"}' nudge
run_test "Edit active issue" '{"tool_name":"Edit","tool_input":{"file_path":"/x/docs/issue/foo.md"},"cwd":"/x"}' nudge
run_test "Bash cat issue" '{"tool_name":"Bash","tool_input":{"command":"cat docs/issue/foo.md"},"cwd":"/x"}' nudge
run_test "Bash head issue" '{"tool_name":"Bash","tool_input":{"command":"head -5 docs/issue/foo.md"},"cwd":"/x"}' nudge
run_test "Bash grep issue" '{"tool_name":"Bash","tool_input":{"command":"grep foo docs/issue/foo.md"},"cwd":"/x"}' nudge
run_test "Bash sed issue" '{"tool_name":"Bash","tool_input":{"command":"sed -n 1,10p docs/issue/foo.md"},"cwd":"/x"}' nudge

# bypass 解消 (= 旧 grep+sed では false negative だったが、jq parse で nudge 発火)
run_test "Bash JSON-escaped path" '{"tool_name":"Bash","tool_input":{"command":"cat \"docs/issue/foo.md\""},"cwd":"/x"}' nudge

# INDEX / README は素通り
run_test "Read INDEX" '{"tool_name":"Read","tool_input":{"file_path":"/x/docs/issue/INDEX.md"},"cwd":"/x"}' silent
run_test "Read README.md" '{"tool_name":"Read","tool_input":{"file_path":"/x/docs/issue/README.md"},"cwd":"/x"}' silent
run_test "Read README-ja.md" '{"tool_name":"Read","tool_input":{"file_path":"/x/docs/issue/README-ja.md"},"cwd":"/x"}' silent
run_test "Bash cat INDEX" '{"tool_name":"Bash","tool_input":{"command":"cat docs/issue/INDEX.md"},"cwd":"/x"}' silent

# unrelated path は素通り
run_test "Read unrelated" '{"tool_name":"Read","tool_input":{"file_path":"/x/src/foo.rs"},"cwd":"/x"}' silent
run_test "Bash ls /tmp" '{"tool_name":"Bash","tool_input":{"command":"ls /tmp"},"cwd":"/x"}' silent

# false positive 緩和 (= command 先頭が read/write 系動詞でない場合)
run_test "cmux-msg with path" '{"tool_name":"Bash","tool_input":{"command":"cmux-msg send 12345 <<EOF\ndocs/issue/foo.md\nEOF"},"cwd":"/x"}' silent
run_test "git commit -m with path" '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"see docs/issue/foo.md\""},"cwd":"/x"}' silent
run_test "git log with path" '{"tool_name":"Bash","tool_input":{"command":"git log docs/issue/foo.md"},"cwd":"/x"}' silent
run_test "echo with path" '{"tool_name":"Bash","tool_input":{"command":"echo docs/issue/foo.md"},"cwd":"/x"}' silent

# 対象外 tool で hook error にならないこと (= fail-open)
run_test "TaskCreate" '{"tool_name":"TaskCreate","tool_input":{"subject":"foo"}}' silent
run_test "Glob" '{"tool_name":"Glob","tool_input":{"pattern":"*.md"}}' silent
run_test "AskUserQuestion" '{"tool_name":"AskUserQuestion","tool_input":{}}' silent
run_test "TaskUpdate" '{"tool_name":"TaskUpdate","tool_input":{"taskId":"1"}}' silent

# 不正 JSON / 空入力 fail-open
run_test "Empty JSON object" '{}' silent
run_test "Bash without command" '{"tool_name":"Bash","tool_input":{}}' silent

# bypass 解消 (= 旧 grep+sed では false positive 起きた、Edit old_string にリテラル "tool_name":"Bash")
run_test "Edit with tool_name literal in old_string" '{"tool_name":"Edit","tool_input":{"file_path":"/x/src/foo.rs","old_string":"\"tool_name\":\"Bash\""}}' silent

echo ""
echo "=== SessionStart: issue-count-nudge.sh ==="

run_test_sst "resume (skip)" '{"source":"resume","cwd":"/x"}' 0
run_test_sst "startup empty cwd" '{"source":"startup","cwd":"/nonexistent"}' 0
run_test_sst "empty JSON" '{}' 0
run_test_sst "bad JSON" 'not json' 0
run_test_sst "empty stdin" '' 0

echo ""
echo "=== Summary: $pass pass, $fail fail ==="
[ $fail = 0 ]
