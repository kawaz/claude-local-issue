# STRUCTURE

```
README{,-ja}.md            最初の窓口(英訳必須)
LICENSE                    MIT
SKILL.md                   plugin root SKILL.md。/local-issue:local-issue で打てる AI 向け全体ガイド (判断軸 + 設計指針の正本)
.claude-plugin/
  plugin.json              plugin 宣言 (name: local-issue。リポ名 claude-local-issue から claude- を落とす=gh-monitor 慣習)
  marketplace.json         marketplace 宣言
commands/                  ユーザ invocable な sub-command を全てここに置く (= DR-0003 で commands 統一)
  list.md                  /local-issue:list      一覧 (haiku, fork)
  read.md                  /local-issue:read      1 件読み + last_read 記録 + 方針 TODO 化 (haiku, fork)
  write.md                 /local-issue:write     起票 (sonnet, fork)、category 判定・INDEX 反映・vcs commit
  update.md                /local-issue:update    更新 / close (sonnet, fork)、close 時 archive 移動 + 後続 DR 起票
  migrate.md               /local-issue:migrate   bulk migration (sonnet, fork)、frontmatter 欠落補完・INDEX 再生成
templates/                 supporting file (plugin 直下、`${CLAUDE_PLUGIN_ROOT}/templates/` 参照)
  issue.md                 issue 雛形 (write/migrate が起票時に Read)
  index.md                 INDEX 雛形 (migrate が再生成時に Read)
hooks/
  hooks.json               PreToolUse 誘導(matcher *) + SessionStart 促し(matcher *)
  issue-access-guard.sh    Read/Write/Edit/Bash で docs/issue/ 直アクセス検知 → command 誘導(非ブロック・パス判定)
  issue-count-nudge.sh     未解決件数が閾値超 → list 促し(resume 除外、archive 非カウント)
docs/
  DESIGN{,-ja}.md          ドメイン + アーキテクチャ
  STRUCTURE.md             この file
  decisions/
    DR-0001-skill-over-hook-isolation.md         (= Superseded by DR-0003 でも本体は保存)
    DR-0002-db-model-supersedes-delete-flow.md
    DR-0003-commands-unification-and-migrate.md
    INDEX.md
  findings/
    YYYY-MM-DD-<slug>.md   検証結果 / 観察記録
  issue/
    YYYY-MM-DD-<slug>.md   active な issue
    archive/               close 済み(resolved/discarded)。経緯 DB。list はデフォルト見ない
    INDEX.md               active issue の正本
justfile                   task runner(canonical: kawaz/bump-semver に準拠)
```

## 配置判断 (= DR-0003)

- **Claude Code の `commands/` と `skills/` 配置は runtime 上同一機構**。配置 layout は慣習であり、機能差はない (claude-plugin-reference §1)。本 plugin は全 sub-command を `commands/` 統一
- **ユーザ invocable な sub-command は全部 `commands/<name>.md` に一般語 (= 短縮形) で置く**
  - namespace 衝突は補完 fuzzy match で吸収、実行時は `/<plugin>:<name>` で明確
  - 短縮形 (`/list` `/write`) を直打ちしても自前 command が候補に出る
- **supporting file は plugin 直下 `templates/`** に集約、`${CLAUDE_PLUGIN_ROOT}/templates/<name>.md` で参照
- **plugin root `SKILL.md`** で全体ガイド (= AI への入口)。各 sub-command の description を 1 行に圧縮できる
- **agent は不採用**: issue CRUD は定型フローで独立ペルソナ不要、隔離と低コストモデルは command frontmatter (= `model + context: fork + agent: general-purpose`) で達成

## frontmatter audience の区別 (= DR-0003)

| field / 場所 | audience | 用途 |
|---|---|---|
| `description` | AI | command 発見 / 自動 invoke trigger / listing 常時 context (= 1-2 文に圧縮) |
| `argument-hint` | ユーザ | 補完中の `[...]` グレー hint (= 引数の選択肢 1 行、人間が打つ材料) |
| 本文 (`---` 以下) | AI (invoke 時) | standing instructions、固定フロー |
| 本 plugin root SKILL.md | AI | 全体ガイドの entry point、詳細仕様の正本 |
