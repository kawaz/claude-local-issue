#!/usr/bin/env bash
# INDEX.md の canonical 順序チェッカ (正本: templates/index.md)
#
#   1. status 優先順: idea → open → wip → blocked → pending-sublimation
#   2. 同 status 内は date 降順
#
# 使い方: check-index-order.sh [INDEX.md path]   (default: docs/issue/INDEX.md)
# 違反行を stderr に出して exit 1、順序どおりなら exit 0。
set -u

index="${1:-docs/issue/INDEX.md}"

if [ ! -f "$index" ]; then
  echo "no such INDEX: $index" >&2
  exit 2
fi

status_rank() {
  case "$1" in
    idea) echo 1 ;;
    open) echo 2 ;;
    wip) echo 3 ;;
    blocked) echo 4 ;;
    pending-sublimation) echo 5 ;;
    *) echo 99 ;;
  esac
}

violations=0
prev_rank=0
prev_date=9999-99-99
prev_slug=""

while IFS='|' read -r _ date category status slug _rest; do
  date=$(echo "$date" | tr -d ' ')
  status=$(echo "$status" | tr -d ' ')
  slug=$(echo "$slug" | sed -E 's/.*\[([^]]*)\].*/\1/; s/ //g')
  # header / separator / 非データ行を除外
  case "$date" in
    date|---|'') continue ;;
  esac
  : "$category"

  rank=$(status_rank "$status")
  if [ "$rank" = 99 ]; then
    echo "unknown status '$status' at row [$slug]" >&2
    violations=$((violations + 1))
    continue
  fi

  if [ "$rank" -lt "$prev_rank" ]; then
    echo "status order violation: [$slug] status=$status comes after [$prev_slug]" >&2
    violations=$((violations + 1))
  elif [ "$rank" = "$prev_rank" ] && [[ "$date" > "$prev_date" ]]; then
    echo "date order violation: [$slug] date=$date comes after [$prev_slug] date=$prev_date (same status=$status)" >&2
    violations=$((violations + 1))
  fi

  prev_rank=$rank
  prev_date=$date
  prev_slug=$slug
done < "$index"

if [ "$violations" != 0 ]; then
  echo "$index: $violations canonical order violation(s)" >&2
  exit 1
fi
echo "ok: $index (canonical order)"
