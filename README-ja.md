# claude-local-issue

> [English](./README.md) | 日本語

ローカルの `docs/issue/` を、低コストモデルで動く **スキル群 (write / list / read / update)** として回す Claude Code プラグイン。issue の CRUD・index 保守・VCS commit を **メインセッションのコンテキストから隔離** する。

## 何を解決するか

`docs/issue/` 運用には状態モデル(`idea/open/wip/blocked/pending-sublimation`)も解決時の削除フローも既に規約としてあるが、**遷移を駆動する仕組みがない**ため、

- 完了 issue が放置され、毎セッション「今どれをやってあるか」の確認が走る
- 起票・index 更新・commit を起票元セッションが手作業でやり、コンテキストを食う + やり方がブレる
- read したまま放置される

これを、各操作を **低コストモデル (`model: haiku` + `context: fork`) のスキル** に隔離して解決する。起票元セッションは「リポ名・slug・本文を渡してスキルを 1 回呼ぶ」だけで済み、コンテキスト負荷は Write 1 回相当に収まる。

## 提供スキル

| スキル | 役割 |
|---|---|
| `write` | 起票。category 判定 → ファイル生成 → index にこの 1 件反映 → `bump-semver vcs commit`(push しない)。クロスプロジェクト起票対応 |
| `list` | 一覧。status / category / 放置期間で集計・ソートして返す(読むだけ) |
| `read` | 1 件を読む + Last-Read 記録 + 「方針を決めて update するまで」を TODO 化させる |
| `update` | status 変更 / 本文更新 / 解決(記録先退避 → 削除 → index 除去) |

すべて 1 件スコープ。**他 issue や index 全体には触らない**(発火スコープ = 作業スコープ)。

## category (enum)

`idea` / `bug` / `request` / `design` / `task` / `tech-memo`。
write/update 時にスキルが本文から判定する(正規化は書き込み時の一度きり、list では行わない)。

## 提供フック

| フック | 役割 |
|---|---|
| `PreToolUse` (Read/Write/Edit on `**/docs/issue/*.md`) | 生アクセスを検知してスキル経由を促す(非ブロック。INDEX.md は除外) |
| `SessionStart` (startup/resume) | issue が溜まっている / 放置されている時に `list` を促す(該当なしなら無音) |

## 設計の前提 (重要)

- スキルは **commit まで**。push はしない(届ける判断は別レイヤ)
- commit は `bump-semver vcs commit -m ... <paths>` の **パス限定**(他の dirty な変更を巻き込まない・冪等)
- index・命名規則・ja/en などの docs 規約は全てスキル内に閉じ、起票元は覚えなくてよい

詳細は [docs/DESIGN-ja.md](./docs/DESIGN-ja.md)。

## ライセンス

MIT License, Yoshiaki Kawazu (@kawaz)
