# DR-0005: update スキル入力形式は自然文一本を維持する (9cell-trial への回答)

- Status: Active
- Date: 2026-06-20

## Context

別 session (= kawaz/claude-nandakke) で 9 並列試験 (3 入力形式 × 3 修正タスク) を実施し、update スキルの入力形式 improvement として 5 つの候補が提案された (docs/issue/2026-06-19-update-input-format-improvements-from-9cell-trial.md)。

候補:

- Q1: 全置換タスクで I2/I3 (= Edit ペア配列 / section 指定) の指定漏れ対策
- Q2: 自然文の subagent が Write で全文再書き込みする傾向の抑制
- Q3: section 指定形式の section キー仕様明文化
- Q4: 試験テンプレのツール呼出数記録標準化
- Q5: 全置換前の grep ステップ推奨

## Decision

### (a) update SKILL.md の入力形式は **自然文一本を維持**

Edit ペア配列 (`[{old_string, new_string}, ...]`) や section 指定 (`section + new_content`) を入力スキーマに加えない。

### (b) Q2 と Q5 のみ採用 (= 自然文形式内のベスプラとして追記)

- **Q2 (Write 回避)**: 本文に「全置換は `Edit replace_all` を優先、Write での全文再書き込みは大ファイルでコスト増 + 転記ミスリスクあるため回避」を明記
- **Q5 (grep 推奨)**: 本文に「対象フレーズの出現箇所をまず grep で確認し、想定外の出現箇所を取りこぼさない」を明記 (= subagent 側のフローに組み込む)

### (c) Q1 / Q3 / Q4 は不採用

- **Q1**: 自然文一本維持なので「section またがる場合の入力形式分岐」自体が発生しない
- **Q3**: section 指定形式を採用しないので section キー仕様の明文化も不要
- **Q4**: 試験テンプレ側 (= claude-nandakke の試行メモ) の改善であって plugin 側ではない

## Alternatives Considered

### A. Edit ペア配列 + section 指定形式を入力スキーマに加える

- 利点: subagent の解釈余地を減らし、機械的処理で安定
- 不採用理由:
  - **親 AI の事前 grep 調査コスト** が増大、issue が多い状況での「軽い update」UX が劣化
  - 試験結果でも「親 AI が `2 箇所` と雑に見積もって実際 5 箇所 → 取りこぼし」が起きた = 構造化入力の前提が崩れやすい
  - subagent が AI (haiku/sonnet) なので「自然文の指示」を解釈する能力は十分、機械的構造化のメリット限定的
  - 入力スキーマを増やすと SKILL.md 本文も肥大化し、AI への description 圧縮の方針と矛盾 (= DR-0003 (e) frontmatter audience 区別)

### B. 全 5 候補を採用 (= 入力形式拡張 + Q4 試験テンプレ標準化を逆輸入)

- 不採用理由: A と同じ + 試験テンプレ標準化は plugin 責務外

### C. Q2/Q5 含めて何も追記しない (= 完全現状維持)

- 不採用理由: Q2/Q5 は自然文形式内のベスプラとして純粋な改善、追記コスト低、subagent の挙動安定化に寄与

## Consequences

- update SKILL.md は自然文一本のシンプル設計を維持 (= 入力構築コスト低、AI 推論コスト高、subagent の解釈に AI 推論を信頼)
- Q2/Q5 の追記により Write 全文書き換えや grep 漏れの傾向を低減
- 9 並列試験データ (kawaz/claude-nandakke の `docs/journal/2026-06-19-update-input-format-trial/SUMMARY.md`) は採否判断の根拠として保存

## 関連

- 起票 issue: docs/issue/2026-06-19-update-input-format-improvements-from-9cell-trial.md (本 DR 確定で close 予定)
- 一次資料: kawaz/claude-nandakke `docs/journal/2026-06-19-update-input-format-trial/SUMMARY.md`
- DR-0003 (e): frontmatter audience 区別 — description / argument-hint / 本文 / plugin root SKILL.md の役割分担。本 DR は update 本文側の設計指針
