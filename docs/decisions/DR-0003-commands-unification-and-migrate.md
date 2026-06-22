# DR-0003: commands 配置統一 + plugin root SKILL.md + migrate 新設 + frontmatter audience 区別

- Status: Active
- Date: 2026-06-19
- Supersedes: DR-0001 の配置判断部 (= commands/skills 混在の判断)

## Context

claude-local-issue v0.1.0 〜 v0.1.2 の dogfood で以下が判明:

1. **commands/list, commands/read の本文ゼロ事象** (= [findings/2026-06-19-empty-command-body-issue.md](../findings/2026-06-19-empty-command-body-issue.md)): SKILL.md / commands ファイル本文が fork 先 subagent prompt の主たる standing instructions という仕様を見落とし、frontmatter のみで実装したため `/local-issue:list` が「ready to help」を返した
2. **補完 namespace 衝突の実害は限定的**: 短縮形 (`/list` 等) を直打ちしても fuzzy match で自前 command が候補に出る、実害は補完ノイズだけ (= claude-plugin-reference §4 含意「短縮形狙うなら plugin 名 prefix で揃える」は skills 配置前提で偏っていた)
3. **`description` と `argument-hint` の audience 区別**: description は AI 向け (= listing 常時 context、自動 invoke trigger)、argument-hint はユーザ向け (= 補完中のグレー hint)。混在させると context 圧迫 + 補完で読みにくい
4. **dogfood で migration 必要事象が露呈**: cmux-msg 先行 migration や claude-plugin-reference リポでの frontmatter 欠落 issue 観察、bulk normalization する sub-command が欠落していた

## Decision

### (a) ユーザ invocable な sub-command は全部 `commands/<name>.md` に一般語命名で統一

- 旧 (DR-0001): list/read → `commands/`、write/update → `skills/`
- 新: list/read/write/update/migrate → 全部 `commands/`、一般語名 (短縮形)
- namespace 衝突は補完 **fuzzy match** で吸収、実行時の解決は `/<plugin>:<name>` で明確

### (b) supporting file は plugin 直下 `templates/` に集約

- 旧: `skills/write/templates/issue.md` (= `${CLAUDE_SKILL_DIR}/templates/issue.md`)
- 新: `templates/issue.md`, `templates/index.md` (= `${CLAUDE_PLUGIN_ROOT}/templates/...` 参照)

### (c) plugin root `SKILL.md` を新設

- `/local-issue:local-issue` で打てる AI 向け全体ガイド
- 各 sub-command の判断軸 / status enum / category enum / 設計指針 / 関連 DR をまとめる
- 各 sub-command の `description` を 1 行に圧縮できる (= 詳細は plugin root を参照)

### (d) `commands/migrate.md` 新設

- docs/issue/ 全体を frontmatter/INDEX 正本化する **bulk migration** command
- write/update が 1 件スコープなのに対し、migrate は bulk スコープ
- 旧形式 (frontmatter 欠落 / 本文行で status / INDEX 不在) を新形式へ吸収、no-historical-noise コメント削除、INDEX 再生成

### (e) frontmatter audience 区別

| field / 場所 | audience | 用途 | 書き方 |
|---|---|---|---|
| `description` | AI | command 発見 / 自動 invoke trigger / listing 常時 context | 「何 + いつ呼ぶか」1-2 文 |
| `argument-hint` | ユーザ | 補完中スペース後にグレーで `[...]` 表示 | 引数の選択肢 1 行、人間が打つ材料 |
| 本文 (`---` 以下) | AI (invoke 時) | standing instructions、固定フロー | 入力 / 固定フロー / やらないこと / 報告 |
| 本 plugin root SKILL.md | AI | 全体ガイドの entry point、詳細仕様の正本 | 各 sub-command の short description を補完 |

→ description で AI 向けとユーザ向けを混在させない。

### (f) Priority field は frontmatter に追加しない

- cmux-msg dogfood feedback 論点 6 (Priority / 発見元 field の扱い) への回答
- Priority 概念は **放置日数** で代替 (= list の放置日数降順ソートが優先度表示の代替)
- Priority field を schema に入れると「優先度更新」フローが新たに生え、責務が広がる
- 旧本文行 `- Priority: <p>` は migrate が **本文残置** (= frontmatter に吸収しない)

## Alternatives Considered

### A. `skills/` 統一 + plugin 名 prefix 命名 (`local-issue-list` 等)

- claude-plugin-reference §4 推奨 (= cmux-msg-list 方式) に従う案
- 不採用理由: cmux-msg と命名規約は揃うが、リネーム範囲が広い (= STRUCTURE / DESIGN / DR-0001 / docs/issue/ 全件への波及)。`:` namespace 区切りで plugin/sub-command 境界が明示される (a) の方が AI/ユーザ双方の認知負荷が低い

### B. 現状の commands と skills の混在維持

- DR-0001 の元判断 (= 配置判断軸「単一ファイル完結 vs supporting file あり」)
- 不採用理由: 配置判断軸が「supporting file の有無」だったが、本文ゼロ事象を踏まえると runtime 同一機構の意義は薄い (= どちらでも `${CLAUDE_PLUGIN_ROOT}` 経由で plugin 直下 supporting file を参照可能、配置 layout に意味分離させる必要なし)。AI/ユーザ視点で「全部 commands 一本」の方が認知統一できる

### C. `skills/` 統一 + 一般語命名 (`/write` で打てる短縮形)

- 不採用理由: 短縮形が namespace 衝突しないことは fuzzy match で確認できたが、`:` 区切りの方が plugin 境界明示性が高い (= AI が補完表示から「どの plugin の sub-command か」を判断する材料が出る)。実用解としては (a) と差は小さい

## Consequences

- list/read/write/update/migrate の 5 つが全て `/local-issue:<name>` で発見可能、補完 fuzzy match で短縮形も拾える
- plugin root SKILL.md が AI 向け詳細仕様の正本になり、各 sub-command の description を短く保てる (= listing context 圧迫を防ぐ)
- migrate sub-command により bulk migration が定型化され、cmux-msg / claude-plugin-reference 等の旧形式 docs/issue 群への適用がしやすい
- DR-0001 の配置判断部 (= commands/skills 混在) は Superseded、隔離原則 (= sub-command 経由で context 隔離) は維持

## 関連

- [DR-0001](./DR-0001-skill-over-hook-isolation.md): sub-command 隔離 (= 隔離原則は維持、配置判断のみ Superseded)
- [DR-0002](./DR-0002-db-model-supersedes-delete-flow.md): archive + DB モデル, status/category enum 確定
- [findings/2026-06-19-empty-command-body-issue.md](../findings/2026-06-19-empty-command-body-issue.md): dogfood 経緯
- claude-plugin-reference 起票: `docs/issue/2026-06-19-user-invocable-skill-placement-and-description-audience.md` (= reference 本体への還元、当事者判断に委ねた)
