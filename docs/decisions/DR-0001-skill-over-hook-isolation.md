# DR-0001: issue 操作を sub-command に隔離する

- Status: Active (= Decision の中核は維持、配置判断 `commands/skills` 混在の部分のみ Superseded by DR-0003)
- Date: 2026-06-18
- 注: ファイル名の `skill-over-hook-isolation` は起票時の固有名詞として保持 (= 履歴的識別子)。本文の「skill」「command/skill」は DR-0003 確定以降 sub-command に統一

## Context

`docs/issue/` 運用は status モデルと解決時フローを docs-structure rule (claude-rules-personal) が規約として持つが、遷移を駆動する仕組みがない。結果、完了 issue が放置され、毎セッション「今どれが残っているか」の確認が走る。起票・index 更新・commit を起票元セッションが手作業でやるとコンテキストを食い、やり方もブレる。

## Decision

issue の CRUD を sub-command に隔離する (= 起票当時は list/read を `commands/`、write/update を `skills/` に配置、DR-0003 で全 sub-command を `commands/` 統一に変更)。起票元セッションは「リポ名 / slug / 本文を渡して 1 回呼ぶ」だけで済み、コンテキスト負荷は Write 1 回相当。各操作は 1 件スコープで、他 issue や index 全体には触らない(発火スコープ = 作業スコープ)。

低コストモデルと隔離は frontmatter の `model + context: fork + agent: general-purpose` で達成する(claude-plugin-reference の skills.md §9.2 recipe)。list/read は内容判定が軽いので haiku、write/update は category 判定・reason 正規化を含むので sonnet。

## Alternatives Considered

- 全てフックで矯正(Write 後に additionalContext で軌道修正)
  - 不採用理由: 起票元セッションが多段作業を全部やる前提が残り、はみ出しを後追いで叩くだけ。注入文をどう絞っても作業自体は起票元コンテキストに乗る
- agent(`agents/*.md`)として実装
  - 不採用理由: agent は別 system prompt を持つ独立判断ワーカーで、AI が自動 delegate する主体。issue CRUD は定型フロー適用で独立ペルソナ不要。隔離と低コストモデルは sub-command frontmatter で達成でき、agent ファイルは過剰
- 生アクセスを PreToolUse exit 2 でブロック
  - 不採用理由: sub-command 本体も Read/Write/Edit を使うため、ブロックすると本体が止まる。非ブロックの誘導(additionalContext)に留める

## Consequences

- ~~list/read は `commands/`、write/update は `skills/`~~ → **DR-0003 で「ユーザ invocable は全部 `commands/<name>.md` に一般語命名で統一」に変更**。理由は補完の namespace 衝突が fuzzy match で吸収される実機観察 + audience を意識した plugin root SKILL.md 経由の集約設計
- commit はパス限定・push しない(届ける判断は別レイヤ)
- ~~write sub-command は `${CLAUDE_SKILL_DIR}/templates/issue.md` を参照~~ → **DR-0003 で `${CLAUDE_PLUGIN_ROOT}/templates/issue.md` (plugin 直下) に移動**。template 変数は sub-command 起動時に展開され fork 先 subagent prompt に渡るため fork 下でも Read できる
- fork 下での sub-command 共存、template の Read 可否、model 指定の効きは実機確認済 (v0.1.1 〜 v0.1.2 + cmux-msg 起票 dogfood で OK 確認、findings/2026-06-19-empty-command-body-issue.md 参照)

## 関連

- DR-0002 (削除運用を archive+DB モデルへ発展させ enum を確定)
- claude-plugin-reference の skills.md §9.2 (subagent recipe), §4.3 (template 変数の展開境界)
