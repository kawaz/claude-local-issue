# claude-local-issue

> [English](./README.md) | 日本語

ローカルの `docs/issue/` を、低コストモデルで動く **サブコマンド群 (write / list / read / update / migrate)** として回す Claude Code プラグイン。issue の CRUD・INDEX 保守・VCS commit を **メインセッションのコンテキストから隔離** する。

## 何を解決するか

`docs/issue/` 運用には状態モデル (`idea / open / wip / blocked / pending-sublimation / resolved / discarded`) も archive モデル (close 時の物理移動) も既に規約としてあるが、**遷移を駆動する仕組みがない**ため:

- close 済 issue が active ディレクトリに残り、毎セッション「今どれをやってあるか」の確認が走る
- 起票・INDEX 更新・commit を起票元セッションが手作業でやり、コンテキストを食う + やり方がブレる
- read したまま放置される

これを、各操作を **低コストモデル (`model: haiku` / `sonnet` + `context: fork`) のサブコマンド** に隔離して解決する。起票元セッションは「リポ名・slug・本文を渡してサブコマンドを 1 回呼ぶ」だけで済み、コンテキスト負荷は Write 1 回相当に収まる。

## Quick Start

```bash
# 1. インストール
/plugin marketplace add kawaz/claude-local-issue
/plugin install local-issue@local-issue
/reload-plugins

# 2. カレントリポの active issue を一覧 (読み専、放置日数降順)
/local-issue:list

# 3. 最初の issue 起票
/local-issue:write my-first-idea "アイデアの本文..."

# 4. 旧形式の docs/issue/ がある場合は正本化
/local-issue:migrate --dry-run    # 差分プレビュー
/local-issue:migrate              # 適用
```

要件: `PATH` に `bump-semver` (= パス限定 vcs commit driver)、`python3` (= hook 内 JSON エスケープに使用)、`bash`、`git` or `jj`。macOS / Linux。

## サブコマンド

| サブコマンド | 役割 |
|---|---|
| `write` | 1 件起票。category 判定 → `templates/issue.md` から生成 → INDEX にこの 1 件反映 → `bump-semver vcs commit` (push しない)。クロスプロジェクト起票 (= 起票先 ≠ カレントプロジェクト) 対応 |
| `list` | active issue を status / category / 放置日数で集計・ソート (読み専)。フィルタ: `--status` / `--category` / `--stale-days` / `--unread-only` / `--include-archive` / `--repo` |
| `read` | 1 件読み + `last_read` (full ISO8601 + TZ) 記録 + 「次方針を決めて update でステータス反映するまで」を呼び出し側 TODO に積ませる。archive 直接指定時は `last_read` 更新と commit をスキップ |
| `update` | status 変更 / 本文更新 / **close** (= `archive/` へ物理移動、`close_reason` を `string[]` に正規化、未実装 DR の後続 issue 自動起票)。**削除でなく archive 保存** (= 経緯 DB として残す) |
| `migrate` | docs/issue/ 全体を一括正本化。frontmatter 欠落補完、本文から category 自動判定、旧本文行 (`- Status:` / `- Date:` / `- 発見元:` 等) を frontmatter に吸収、`no-historical-noise` コメント削除、`templates/index.md` から INDEX 再生成。`--dry-run` でプレビュー |

すべて 1 件スコープ (例外: migrate のみ bulk 走査)。**他 issue や INDEX 全体には触らない** (発火スコープ = 作業スコープ)。

## category (enum)

`idea` / `bug` / `request` / `design` / `task` / `tech-memo`。
`write` / `update` 時にスキルが本文から判定する (正規化は書き込み時の一度きり、`list` では行わない)。

## フック

| フック | 役割 |
|---|---|
| `PreToolUse` (`Read` / `Write` / `Edit` / `Bash`) | `docs/issue/<file>.md` への生アクセス — shell 経由 (`cat` / `head` / `tail` / `grep` / `sed` / `less` / ...) も含む — を検知してサブコマンド経由を促す (非ブロック、`INDEX.md` / `README*` は除外) |
| `SessionStart` (`startup` / `clear` / `compact`、`resume` は除外) | active issue 件数しきい値超 or 放置検出時に `list` を促す (該当なしなら無音) |

## 設計の前提 (重要)

- サブコマンドは **commit まで** — push はしない (届ける判断は別レイヤ)
- commit は **パス限定** (`bump-semver vcs commit -m ... <paths>` or `cp + rm` 後の `--staged`、`-a / git add .` は使わない)
- INDEX / 命名規則 / ja-en 等の docs 規約は全てサブコマンド内に閉じ、起票元は覚えなくてよい
- close 済 issue は **`docs/issue/archive/` へ物理移動**、削除ではない (= 経緯 DB として残す)。`list` はデフォルト `archive/` を見ない (`--include-archive` で含む)
- 全 1 件コマンドは **1 issue ファイル + INDEX のみ**を触る (= 他 issue / 全 index は触らない、発火スコープ = 作業スコープ)

詳細は [SKILL.md](./SKILL.md) (= `/local-issue:local-issue` で開く AI 向け全体ガイド)、[docs/DESIGN-ja.md](./docs/DESIGN-ja.md) (= アーキテクチャ)、[docs/decisions/](./docs/decisions/) (= 設計判断履歴)。

## ライセンス

MIT License, Yoshiaki Kawazu (@kawaz)
