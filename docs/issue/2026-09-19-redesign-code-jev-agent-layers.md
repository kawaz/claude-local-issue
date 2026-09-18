---
title: local-issue を「コード / Jev / agent」の 3 層に再設計する
status: idea
category: design
created: 2026-09-19T08:57:04+09:00
last_read:
open_entered:
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: sandbox-jev
---

# local-issue を「コード / Jev / agent」の 3 層に再設計する

## 概要

kawaz の問題意識 (2026-09-19): 常設ルールで守られないポイントを機械 / エージェントでチェックさせる目的で local-issue を作ったが、遅い・うまく操作できない・更新も滞っており、動作原理から再設計してよい。

## 背景

### 現状の原因

決定的にできる処理 (ISO 時刻、frontmatter 更新、INDEX の canonical 位置への差し替え、mv、3 パス commit、is clean 確認) まで、fork した sonnet が散文の手順書を読んで実行している。CHANGELOG の bug (fork が ambient context から任務を創作して 13 issue を一括処理、close で mv 元が commit から漏れる、INDEX 順序が差分経路で崩れる、read が cwd に空ファイルを作る、body 先頭語を slug に取る) はほぼ全てその帰結。1 起票に 40 秒超・約 9 万 token。PreToolUse hook は shell を regex 解析するため advisory 止まり。

### 責務の振り直し (優先順)

| 優先 | 責務 | 層 |
|---|---|---|
| 0 | 起票先の振り分け (ローカル docs/issue か GitHub issue か) | コード。`~/.local/share/repos/github.com/<owner>/` の owner (kawaz = ローカル、業務用アカウント / 業務組織 / 第三者 = GitHub) で決定的に決まる。規約パス外の worktree は `git remote get-url origin` にフォールバック。引数上書きは原則不要 |
| 1 | ディレクトリ規約・命名・INDEX 更新・frontmatter の項目完備・パス限定 commit | コード (本物の CLI)。command .md は CLI を叩く薄い案内になり、fork も sonnet も不要 |
| 2 | category / status (実装済み・実装中・不明) / idea かメモか | Jev (TypeSafe AI の判断 API)。本文 + 引数で渡された context を state に。Jev 不在時は判定なし + 警告で通す |
| 3 | 放置されていないか・もう close 済みではないかの確率 | Jev。本文 + 各 TS + リポの最近の commit log を state に。archive 済み issue を golden set にして精度を測ってから採用 |
| 4 | list / 本文執筆 / close 時に DR・journal へ何を残すか | agent (起票元の AI がそのまま) |
| — | read 時の last_read 記録と commit、read カウント | 廃止。read が作業のためか一覧のためか、クロスプロジェクトかで意味が変わり TS では測れない。放置は 3 で見る |

### 副産物

CLI 化すると command 本体が Read / Write / Edit を使わなくなるので、`docs/issue/*.md` への直接 Write / Edit を PreToolUse で exit 2 ブロックでき、advisory から enforcement に上げられる (DR-0001 の不採用理由が消える)。

### 増やしたくないもの

- LLM が実行する散文の手順書
- issue の状態を持つ場所 (frontmatter 以外に増やさない)
- read のたびの commit

### 未決

- CLI の言語と置き場 (bump-semver と同じ Rust で `vcs` を再利用するか、shell + jq + yq で PoC か)
- Jev の日本語 category 判定の精度 (docs は CJK で精度低下と明記)。既存 issue + archive を golden set に
- 実験の記録は sandbox-jev リポの docs/findings/ (Jev の性質: 基準文を字義通り読む、価値判断は平らになる、fan-out は 1 往復、criteria に発火条件と非発火条件を書く)

## 受け入れ条件

- [ ] {完了の判定基準}

## TODO

<!-- wip 時のみ -->

- [ ] {次に手を付けるサブタスク}
