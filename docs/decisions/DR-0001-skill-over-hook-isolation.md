# DR-0001: issue 操作を command/skill に隔離する

- Status: Active
- Date: 2026-06-18

## Context

`docs/issue/` 運用は status モデルと解決時フローを docs-structure skill が規約として持つが、遷移を駆動する仕組みがない。結果、完了 issue が放置され、毎セッション「今どれが残っているか」の確認が走る。起票・index 更新・commit を起票元セッションが手作業でやるとコンテキストを食い、やり方もブレる。

## Decision

issue の CRUD を `commands/`(list, read) と `skills/`(write, update) に隔離する。起票元セッションは「リポ名 / slug / 本文を渡して 1 回呼ぶ」だけで済み、コンテキスト負荷は Write 1 回相当。各操作は 1 件スコープで、他 issue や index 全体には触らない(発火スコープ = 作業スコープ)。

低コストモデルと隔離は frontmatter の `model + context: fork + agent: general-purpose` で達成する(skills.md §9.2 recipe)。list/read は内容判定が軽いので haiku、write/update は category 判定・reason 正規化を含むので sonnet。

## Alternatives Considered

- 全てフックで矯正(Write 後に additionalContext で軌道修正)
  - 不採用理由: 起票元セッションが多段作業を全部やる前提が残り、はみ出しを後追いで叩くだけ。注入文をどう絞っても作業自体は起票元コンテキストに乗る
- agent(`agents/*.md`)として実装
  - 不採用理由: agent は別 system prompt を持つ独立判断ワーカーで、AI が自動 delegate する主体。issue CRUD は定型フロー適用で独立ペルソナ不要。隔離と低コストモデルは command/skill frontmatter で達成でき、agent ファイルは過剰
- 生アクセスを PreToolUse exit 2 でブロック
  - 不採用理由: command/skill 本体も Read/Write/Edit を使うため、ブロックすると本体が止まる。非ブロックの誘導(additionalContext)に留める

## Consequences

- list/read は `commands/`(ユーザ slash 第一意図・単一ファイル完結)、write/update は `skills/`(内容判定 + supporting file が要る)。command と skill は runtime 同一機構
- commit はパス限定・push しない(届ける判断は別レイヤ)
- write skill は template を本文 embed の `${CLAUDE_SKILL_DIR}/templates/issue.md` で参照する。本文の template 変数は skill 起動時に展開され fork 先 subagent prompt に渡るため fork 下でも Read できる(supporting file 内や bash 内に変数を置くと literal 残りになるので避ける)
- fork 下での command/skill 混在の共存、template の Read 可否、model 指定の効きは実機確認が必要(initial-open-items issue)

## 関連

- DR-0002 (削除運用を archive+DB モデルへ発展させ enum を確定)
- skills.md §9.2 (subagent recipe), §4.3 (template 変数の展開境界)
