# Changelog

All notable changes per release. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.

## [0.2.7] - 2026-06-22

### Added
- `commands/{write,read,update,migrate,list}.md` に input validation section (= slug `^[a-z0-9][a-z0-9-]{0,80}$` + repo 名 `^[a-z0-9_-]+$`、不正なら reject)
- `hooks/test/run-matrix.sh` に archive 配下素通りケース 2 件 (test 30 → 32 pass)

### Changed
- `hooks/issue-access-guard.sh`: path filter に `*docs/issue/archive/*` 除外を追加 (= 過去経緯参照は read しっぱなしで良い、SKILL.md 仕様と整合)
- 全 5 commands の `allowed-tools` の `Bash(bump-semver:*)` を `Bash(bump-semver vcs:*)` 粒度に絞り

### Security
- `hooks/issue-count-nudge.sh` の find に `! -lname '*'` 追加 (= symlink target を count に含める盲点対策、監査 C3)
- slug / repo 名の strict validation で path traversal を防御 (監査 W6 / W11)

## [0.2.6] - 2026-06-22

### Changed
- 用語掃除: 本 plugin の sub-command を指す「skill」表記を「sub-command」に全 doc で統一 (SKILL.md / DESIGN.md / DESIGN-ja.md / STRUCTURE.md / DR-0001/0002/0003 + INDEX.md / templates/index.md / commands/* / justfile コメント)
- 固有名詞 (`SKILL.md` / `skills.md` / `${CLAUDE_SKILL_DIR}` / `commands/` / `skills/` plugin layout 名 / `lint-skills` task 名) は保持

## [0.2.5] - 2026-06-22

### Added
- `hooks/test/run-matrix.sh` 新設 (30 ケースの test マトリクス、`just test` から起動)

### Changed
- `hooks/issue-access-guard.sh` / `hooks/issue-count-nudge.sh` の grep+sed JSON 擬似 parse を **jq ベース構造化 parse に置換** (= 監査 W1/C3/C4 の bypass / false positive 解消)
- 出力 JSON 構築も `jq -n --arg msg ...` で正しくエスケープ
- `justfile` の `lint-json` / `test` も python3 から jq に置換
- README*.md の Requires から python3 を削除、jq に置換

### Security
- JSON-escaped path (= `\"docs/issue/foo.md\"`) を nudge 対象として正しく検出 (= bypass 解消)
- Edit `old_string` 内のリテラル `"tool_name":"Bash"` で誤判定しない (= 旧 grep+sed の false positive 解消)

## [0.2.4] - 2026-06-21

### Added
- README に Quick Start + Requires section (= bump-semver / python3 / bash / git or jj)
- `commands/write.md` `commands/update.md` の frontmatter に `argument-hint`
- `commands/read.md` の archive 経路の報告フォーマットを active と分離して明示

### Changed
- README / plugin.json / marketplace.json の skill 一覧に migrate を反映 (= 4 件 → 5 件)
- README の update 説明を delete モデル → archive モデル (DR-0002) に書き直し
- README の SessionStart matcher 表記を実装 (= startup / clear / compact、resume 除外) に
- `hooks/issue-access-guard.sh` の Bash 経路 false positive 緩和 (= command 先頭が read/write 系動詞のときのみ抽出)
- `hooks/issue-count-nudge.sh` の `set -euo pipefail` → `set -u` (issue-access-guard.sh と統一)
- `templates/issue.md` から `## 解決時の記録先` セクション削除 (= no-historical-noise rule との自己矛盾解消)

### Security
- threshold env (`CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD`) の numeric validation 追加

## [0.2.3] - 2026-06-20

### Fixed
- close フロー の **delete 漏れ bug** 修正 (= v0.2.0-0.2.2 で 3 回再現): `bump-semver vcs commit PATH..` の「nonexistent path silently dropped」仕様により旧 path の delete が commit に含まれなかった
- Step 5 archive 移動を `mv` から `cp + rm` に明示分割、Step 6 commit を `bump-semver vcs commit --staged` に変更、Step 0 で「docs/issue/ 以外の dirty 変更なし」事前確認を追加
- bump-semver 側へも還元起票: `docs/issue/2026-06-20-vcs-commit-path-include-deletes.md`

## [0.2.2] - 2026-06-20

### Added
- DR-0005 (= update sub-command 入力形式は自然文一本を維持) を新規記録
- `commands/update.md` 本文に Q5 (対象フレーズの事前 grep) + Q2 (Edit replace_all 優先、Write 全文回避) を追記
- `commands/update.md` の allowed-tools に Grep / Bash(grep:*) を追加

### Changed
- 9cell-trial 提案 (= claude-nandakke 9 並列試験から) のうち Q1/Q3/Q4 は不採用、Q2/Q5 のみ採用

## [0.2.1] - 2026-06-20

### Fixed
- `commands/list.md` 固定フロー 4 (放置日数計算) の文言を明確化 (= 全件 `?` バグ修正、`created` だけでも計算可能を明示)
- `commands/update.md` close フローに「本文末尾の `## 解決時の記録先` セクション削除」step を追加 (= cmux-msg dogfood feedback (4) への対応)

## [0.2.0] - 2026-06-19

### Added
- **DR-0003** (= commands 配置統一 + plugin root SKILL.md + migrate 新設 + frontmatter audience 区別) を新規記録
- plugin root `SKILL.md` 新設 (= `/local-issue:local-issue` で打てる AI 向け全体ガイド)
- `commands/migrate.md` 新設 (= docs/issue/ 全体の bulk normalization)
- `templates/index.md` 新設 (= migrate が INDEX 再生成時の雛形)

### Changed
- `skills/write/SKILL.md` → `commands/write.md`、`skills/update/SKILL.md` → `commands/update.md` に移動 (= 全 sub-command を commands/ 配置に統一)
- `templates/issue.md` を plugin 直下に移動 (`${CLAUDE_PLUGIN_ROOT}/templates/issue.md`)
- 各 sub-command の description を 1 行に圧縮、詳細仕様は plugin root SKILL.md に集約
- frontmatter audience 区別 (= description は AI 向け / argument-hint はユーザ向け) を docs/STRUCTURE.md / DR-0003 で明文化
- DR-0001 の配置判断部を Superseded by DR-0003、docs/STRUCTURE.md 書き直し
- `justfile` の lint-skills を `SKILL.md + commands/*.md` 対応に更新

### Removed
- Priority field を frontmatter schema に追加しない (= 放置日数で代替、cmux-msg dogfood feedback 論点 6 への回答)

## [0.1.2] - 2026-06-19

### Fixed
- `hooks/issue-access-guard.sh` を Bash 経路にも拡張 (= AI が `cat docs/issue/...` `head` `tail` `grep` `sed` 等で直接読もうとした時に nudge 発火)
- 対象外 tool での hook error 解消 (= TaskCreate / Glob / AskUserQuestion 等で `Failed with non-blocking status code` が出ていた問題、`set -euo pipefail` を `set -u` に変更し fail-open)

## [0.1.1] - 2026-06-19

### Fixed
- `commands/list.md` と `commands/read.md` が frontmatter のみで本文ゼロだった bug を修正 (= fork 先 subagent prompt に standing instructions が渡らず「I'm ready to help」と汎用挨拶を返していた)
- `allowed-tools` を 4 ファイル (commands/list, commands/read, skills/write, skills/update) ともカンマ区切り + `Bash(<cmd>:*)` 形式に統一

## [0.1.0] - 2026-06-19

### Added
- 初版リリース (= empty commit + 初版 feature)
- `commands/list.md` (haiku) - 一覧
- `commands/read.md` (haiku) - 1 件読み + last_read 記録
- `skills/write/SKILL.md` (sonnet) - 起票
- `skills/update/SKILL.md` (sonnet) - 更新 / 解決
- `hooks/issue-access-guard.sh` - PreToolUse 誘導
- `hooks/issue-count-nudge.sh` - SessionStart 促し
- DR-0001 (skill 隔離) + DR-0002 (archive + DB モデル)
