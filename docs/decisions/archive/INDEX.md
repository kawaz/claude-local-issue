# 退避した Decision Records

後続の DR に置き換えられた DR。各ファイルの `Status: Superseded by DR-NNNN` が正本。現役の DR 一覧 ([../INDEX.md](../INDEX.md)) からはこの一覧への 1 行のリンクだけを張り、現役の文書は退避した個々の DR を名指ししない (指す時は置き換え先の現役 DR を指す)。

| DR | 説明 | 置き換え先 |
|---|---|---|
| [DR-0001](DR-0001-skill-over-hook-isolation.md) | issue 操作を低コストモデルの sub-command に隔離する | [DR-0006](../DR-0006-direct-edit-with-mod-normalization.md) |
| [DR-0002](DR-0002-db-model-supersedes-delete-flow.md) | 削除運用を archive と frontmatter の DB モデルにし、status / category の enum を決める | [DR-0006](../DR-0006-direct-edit-with-mod-normalization.md) |
| [DR-0003](DR-0003-commands-unification-and-migrate.md) | sub-command を commands/ に統一し、plugin root の SKILL.md と migrate を置く | [DR-0006](../DR-0006-direct-edit-with-mod-normalization.md) |
| [DR-0005](DR-0005-update-input-format-natural-language-only.md) | update sub-command の入力形式を自然文に限る | [DR-0006](../DR-0006-direct-edit-with-mod-normalization.md) |
