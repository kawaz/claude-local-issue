---
title: update スキルの入力形式 improvement (9 並列試験結果から、議論中・採否未確定)
status: resolved
category: design
created: 2026-06-19T23:58:52+09:00
last_read:
open_entered:
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-06-20T00:10:09+09:00
discard_reason:
pending_reason:
close_reason: ["dr/DR-0005","implemented"]
blocked_by:
origin: kawaz/claude-nandakke (2026-06-19 設計セッション中の dogfooding 試験結果)
---

# update スキルの入力形式 improvement (9 並列試験結果から、議論中・採否未確定)

## 概要

update スキルの `body-edit` パラメータ (= 親 AI → subagent への橋渡し) は現状 **自然文の指示形式** のみ。large issue (議論を追記しながら成熟させる用途、docs-structure 規約で OK) では肥大化リスクがある。

2026-06-19 に 9 並列試験 (3 入力形式 × 3 修正タスク) を実施し、使い分けマトリクスと 5 つの improvement 案を抽出。**採否は当事者 (claude-local-issue 側) で判断**、本 issue は議論用フラグとして起票。

## 背景

### 試験結果 (要約)

#### 使い分けマトリクス (= 試験で実証)

| タスクの性質 | 推奨形式 |
|---|---|
| 1 箇所 typo / 1 行修正 | **自然文** (現状の baseline) |
| 数箇所の点的置換 (箇所確定済) | **Edit ペア配列** `[{old_string, new_string}, ...]` |
| 1 section 全体書き換え | **section 指定** `section + new_content` |
| 横断的全置換 (箇所不確定) | **自然文** (= AI 解釈で全箇所カバー) |
| 複合 | section 指定 + Edit ペア配列の組み合わせ |

#### 構造的発見

- **Edit ペア配列 / section 指定は「親 AI が事前に全箇所を grep で把握している」前提**に成立
- 試験で起票者 (= 親 AI 役) が「親 AI 2 箇所」と雑に見積もった → 実際は 5 箇所 → **I2/I3 で取りこぼし発生**
- **入力構築コスト = 親 AI 側の事前調査の質に直結**
- 自然文は親 AI の事前調査負担を subagent の AI 推論にトレードオフ

詳細データ: kawaz/claude-nandakke `docs/journal/2026-06-19-update-input-format-trial/SUMMARY.md`

### 検討課題 (= 5 つの improvement 候補、採否未確定)

**Q1: 全置換タスクでの I2/I3 指定漏れ対策**

問題: Edit ペア配列と section 指定は「指定範囲しか処理しない」ため、横断的全置換で必然的に取りこぼし発生。
方向性: SKILL.md に「フレーズが複数 section にまたがる場合は自然文または Edit ペア配列 (全箇所指定) を使用する」明記。

**Q2: 自然文の Write 依存問題**

問題: 自然文の subagent が Edit の `replace_all` を使うか Write で全文再書き込みするかを自己判断。Write は大ファイルでコスト増、転記ミスリスク。
方向性: SKILL.md に「全置換は Edit `replace_all` を優先、Write 全体再書き込み回避」明記。

**Q3: section 指定形式の section キー仕様の明文化**

問題: section ヘッダを変更しながら内容も変える場合、section キーが変更前ヘッダか変更後ヘッダかが暗黙。
方向性: SKILL.md に「section キーは変更前のヘッダ文字列 (完全一致) を指定する」明記。

**Q4: ツール呼出数の記録標準化 (試験テンプレ側の改善)**

問題: 試行メモのフォーマットが試行ごとにまちまち。
方向性: テンプレに「Read × N, Edit × N, Write × N (合計 N)」固定。

**Q5: 全置換前の grep ステップ推奨**

問題: 親 AI が出現箇所を事前把握しないと I2/I3 で指定漏れが起きる。
方向性: SKILL.md に「対象フレーズの出現箇所をまず grep で確認」明記、親 AI 側のフローに組み込む。

## 受け入れ条件

- [ ] Q1〜Q5 のうち採用する案を当事者で判断
- [ ] 入力形式の選択肢を増やすか (= Edit ペア配列・section 指定のサポート) 自然文一本のままか判断
- [ ] 起票元の試験データ (`docs/journal/2026-06-19-update-input-format-trial/SUMMARY.md`) を参照して妥当性確認

## 一次資料

- 起票元試験: kawaz/claude-nandakke `docs/journal/2026-06-19-update-input-format-trial/SUMMARY.md`
- 起票元議論: kawaz/claude-nandakke `docs/journal/2026-06-19-nandakke-design-session.md`

## 解決時の記録先

- 単純なコード修正のみ: 記録不要 (commit message で足りる)
- 設計判断を伴う: decisions/DR-NNNN-...md
- 運用上の再発可能性: runbooks/<topic>.md
- 経緯・ハマり所: journal/YYYY-MM-DD-<slug>.md

close 時はこのファイルを docs/issue/archive/ へ移動する(削除しない。経緯を DB として残す)。
