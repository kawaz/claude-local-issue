# commands/list, commands/read が「ready to help」しか返さなかった件

## 判明した事実

- `commands/list.md` と `commands/read.md` は frontmatter のみで本文ゼロだった (v0.1.0)
- Claude Code は skill/command 本文を **standing instructions として fork 先 subagent の prompt に流入させる** (= claude-plugin-reference skills.md §7)
- 本文ゼロだと subagent は description だけが context に乗り、「具体的に何をやれ」が分からないため汎用挨拶 (= "I'm Claude Code... What would you like me to help you with?") を返して終了する
- v0.1.1 で commands/list.md と commands/read.md に固定フロー本文を追加して解消

## 実用的な示唆 / ベストプラクティス

- `commands/*.md` でも `skills/*/SKILL.md` でも、frontmatter だけで「動く」と思ってはいけない。本文(固定フロー)が AI 側の挙動を定義する
- `description` は **listing と AI 自動 invoke trigger 用**であり、本文の代わりにはならない (= description だけでは subagent には「何をすればよいか」の指示にならない)
- 検証時は引数なしでも `/<plugin>:<name>` を 1 度叩いて挙動が定まっているか確認 (= 引数無し時のフォールバック挙動が定まっていれば本文が AI に届いている)

## 検証の詳細

### 事象 (peer 報告)

- 報告元: 別 Claude Code セッション (`session_id: b8dc7776-7d5b-451d-85e2-ca3c1fe9c595`)
- 環境: `cwd=~/.local/share/repos/github.com/kawaz/claude-plugin-reference/main`、`CLAUDE_CONFIG_DIR=~/.claude-personal`、main loop = Opus 4.7 [1m]
- 操作: Skill tool で `local-issue:list` (args 無し) を invoke
- 期待: docs/issue/ 配下の active issue 一覧
- 実態: fork 先が "I'm ready to help! ... What would you like me to help you with?" の汎用挨拶を返して終了

### 原因切り分け

| 仮説 | 検証 | 結果 |
|---|---|---|
| description が AI に届いていない | claude-plugin-reference 確認 | description は listing と invoke trigger 用、subagent prompt 本体ではない |
| 本文が AI に届いていない | skills.md §7 確認 + 実装ファイル目視 | `commands/list.md` `commands/read.md` の本文が `---\n\n` で終わっており空 |
| allowed-tools の書式エラーで block | リファレンス §3 確認 | スペース区切り `"Read Bash(ls *)"` は canonical (カンマ区切り) と差分あり。ただし invoke 自体は走っているので blocking エラーではない |
| fork 起動時の system prompt 差し替え周り | 関連 reference 再確認 | `context: fork` + `agent: general-purpose` は spec 通り。本文不在が真因 |

→ 真因: **commands/list.md と commands/read.md の本文ゼロ**。skill/command 本文は fork 先 subagent の prompt の主たる内容なので、これが空だと subagent は description 程度の文脈で開始 → 汎用挨拶。

### 修正内容 (v0.1.1)

1. `commands/list.md` に「入力 / 固定フロー / やらないこと / 報告フォーマット」を命令調で追加
   - 引数 (`--status` `--category` `--stale-days` `--unread-only` `--include-archive` `--repo`) の解釈ルール
   - 走査対象 (`<root>/docs/issue/*.md`、INDEX.md / README は除外)、放置日数算出、ソート、Markdown 表報告
   - 書き換え系 (`bump-semver vcs commit` / INDEX.md / 状態遷移) をしないことを明示
2. `commands/read.md` に同形式で固定フロー追加
   - $0 (slug or file path) と `--repo` の解釈
   - file 特定 → Read → last_read 更新 (`date -Iseconds`) → path 限定 commit → 報告 + 次方針 TODO の指示
   - archive 配下を読んだ場合は last_read 更新と commit をスキップ
3. `allowed-tools` を 4 ファイル (commands/list, commands/read, skills/write, skills/update) ともカンマ区切り + `Bash(<cmd>:*)` 形式に統一 (リファレンス §3 canonical)
4. plugin.json / marketplace.json の `version` を 0.1.0 → 0.1.1

### 再検証手順 (kawaz)

1. `claude-plugin-update.sh` (push 後の plugin update 全 config dir 反映)
2. `/reload-plugins`
3. `/local-issue:list` (引数なし) — docs/issue/ 配下の active issue が Markdown 表で返るか
4. `/local-issue:read initial-open-items` — frontmatter + 本文 + last_read 更新 + 次方針 TODO が返るか
5. 失敗時は allowed-tools の解釈 / fork 下の `${CLAUDE_SKILL_DIR}` embed 等を切り分けて issue 起票
