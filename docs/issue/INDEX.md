# Issue INDEX

active な issue の一覧。close 済みは archive/ にあり、ここには載せない。

| date | category | status | slug | 概要 |
|---|---|---|---|---|
| 2026-06-20 | task | idea | [audit-nitpicks-and-improvements](./2026-06-20-audit-nitpicks-and-improvements.md) | ペルソナ監査 3 名 (TechWriter/Security/QA) の軽微改善・nitpick 集約 |
| 2026-07-31 | bug | open | [fork-input-contract-compliance-is-probabilistic](./2026-07-31-fork-input-contract-compliance-is-probabilistic.md) | fork 入力契約の遵守が確率的で、修正後の実 command 再検証が未実施 (skill-tool-fork-invocation-drops-arguments の残余分離) |
| 2026-07-10 | bug | open | [worktree-cwd-repo-misresolution](./2026-07-10-worktree-cwd-repo-misresolution.md) | worktree 越境利用時に対象リポを誤認する (セッション cwd 優先の解決が原因か、部外者フラグ) |
| 2026-06-20 | task | open | [sessionstart-count-threshold](./2026-06-20-sessionstart-count-threshold.md) | SessionStart 促しの件数しきい値を運用データで確定する (initial-open-items 分離) |
| 2026-06-20 | task | open | [read-stale-days-threshold](./2026-06-20-read-stale-days-threshold.md) | stale-days しきい値を運用データで確定する (initial-open-items 分離) |
| 2026-07-29 | bug | wip | [close-archive-move-drops-file-deletion-from-commit](./2026-07-29-close-archive-move-drops-file-deletion-from-commit.md) | close 実行時に元ファイルの削除が commit から漏れることがある (残留 diff を stale/無関係と誤判定する報告も) |
