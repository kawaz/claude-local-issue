# STRUCTURE

```
README{,-ja}.md            最初の窓口(英訳必須)
LICENSE                    MIT
.claude-plugin/
  plugin.json              plugin 宣言 (name: local-issue。リポ名 claude-local-issue から claude- を落とす=gh-monitor 慣習)
  marketplace.json         marketplace 宣言
commands/                  ユーザ slash 第一意図 + 内容判定の軽い操作 (runtime は skills と同一機構)
  list.md                  /local-issue:list  一覧(haiku, fork)
  read.md                  /local-issue:read  1件読み+last_read記録+方針TODO化(haiku, fork)
skills/                    内容判定あり + supporting file を使う操作
  write/
    SKILL.md               /local-issue:write 起票(sonnet, fork)。category判定・index反映・vcs commit
    templates/issue.md     issue テンプレ(本文から ${CLAUDE_SKILL_DIR} embed で参照)
  update/
    SKILL.md               /local-issue:update 更新/close(sonnet, fork)。close時 archive移動+後続起票
hooks/
  hooks.json               PreToolUse 誘導(matcher *) + SessionStart 促し(matcher *)
  issue-access-guard.sh    生 Read/Write/Edit 検知 → command/skill 誘導(非ブロック・パス判定)
  issue-count-nudge.sh     未解決件数が閾値超 → list 促し(resume除外, archive非カウント)
docs/
  DESIGN{,-ja}.md          ドメイン + アーキテクチャ
  STRUCTURE.md             この file
  decisions/
    DR-0001-skill-over-hook-isolation.md
    INDEX.md
  issue/
    YYYY-MM-DD-<slug>.md   active な issue
    archive/               close 済み(resolved/discarded)。経緯 DB。list はデフォルト見ない
    INDEX.md               active issue の正本
justfile                   task runner(canonical: kawaz/bump-semver に準拠)
```

## 配置判断 (commands vs skills, agent 不採用)

- **command と skill は runtime 同一機構**。`commands/` は「ユーザ slash 第一意図 + 単一ファイル完結」の配置慣習
- **list / read → commands/**: 内容判定が軽く単一ファイルで完結。ユーザも `/local-issue:list` で打ちたい
- **write / update → skills/**: category 判定・reason 正規化(内容判定)、template 等 supporting file が要る
- **agent は不採用**: agent は別 system prompt を持つ独立判断ワーカー。issue CRUD は定型フロー適用で独立ペルソナ不要。隔離と低コストモデルは skill/command frontmatter の `model + context: fork + agent: general-purpose`(§9.2 recipe)で達成でき、agent ファイルを別途作る必要がない
