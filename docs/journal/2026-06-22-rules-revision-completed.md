# rules-revision-after-plugin の改訂完了

- 日付: 2026-06-22
- 関連 issue: `docs/issue/2026-06-18-rules-revision-after-plugin.md` (本 journal 起票後に resolved で close、archive へ)
- 関連リポ: `kawaz/claude-rules-personal` の commit `9bb1ceb9`
- 担当分離:
  - **peer (5ac1236d)** = claude-rules-personal の rule 改訂 (= 越境受諾)
  - **本 session (585952bc)** = journal 起票 + claude-local-issue 側の issue close

## 経緯

claude-local-issue plugin が v0.2.8 で完成した時点で、本 plugin が前提とする運用 (= archive モデル + 7 値 status + frontmatter ベース INDEX 同期) と、`kawaz/claude-rules-personal` の `for-me/rules/docs-knowledge-flow.md` および `for-me/skills/docs-structure/SKILL.md` の旧 rule (= delete モデル + 5 値 status + 本文ヘッダ形式) との間に齟齬が生じていた。本 issue (`rules-revision-after-plugin`) はこの追従改訂をフラグするものとして 2026-06-18 起票、`blocked_by: plugin 完成` で待機。

plugin v0.2.8 で blocked 条件が解消した 2026-06-22、kawaz の明示振り直しを受けて peer (5ac1236d) が claude-rules-personal で改訂作業を引受。本 session は claude-local-issue 側で audit-hook-robustness + audit-docs-consistency の core 仕事 (= v0.2.7 + v0.2.8 push) を並行進行。

peer は ピンポイント置換 を第一段として採用 (= 全面書き直しは後続 TODO に残す)、受け入れ条件 checkbox 全 4 件を 1 commit (`9bb1ceb9`) で land。

## 改訂内容 (= claude-rules-personal commit 9bb1ceb9)

### docs-knowledge-flow.md

- 「issue 解決時は delete」 → 「plugin の `update <slug> close` で archive 移動」
- status enum: 5 値 (`idea` / `open` / `wip` / `blocked` / `pending-sublimation`) → **7 値** (上記 + `discarded` / `resolved`)
- `docs/issue/INDEX.md` の扱い: 旧「5+ issue 任意導入」 → 新「plugin 必須化」(= write/update sub-command が自動更新)
- 関連リンクに `kawaz/claude-local-issue` 追加 (= SKILL.md / docs/DESIGN.md を機械的詳細の正本として参照)
- 「sub-command」用語で統一 (= claude-local-issue DR-0003 と整合)

### docs-structure skill (SKILL.md + templates)

- `issue/` 節を plugin 前提に書き直し (= 機械的詳細は plugin 側 SKILL.md / DESIGN.md に委譲、rule 側は判断軸のみ)
- 「frontmatter は手書きしない、`write` / `update` sub-command 経由」を明示
- 「解決した issue は削除」 → 「`update <slug> close` で archive 移動」
- issue template (`templates/issue/YYYY-MM-DD-template.md`):
  - 旧: md ヘッダ形式 (`- Status: open`)
  - 新: plugin の YAML frontmatter 形式 (全 `*_entered` / `*_reason` / `blocked_by` を含む)
  - 末尾の「削除する」 → 「`update close` で archive 移動」

### 用語の方針

- 本 plugin の sub-command を指す呼称は **「sub-command」** で統一 (= DR-0003 と整合)
- rules リポ配布物としての **「skill」** (= `docs-structure` skill 等) はそのまま維持 (= 別レイヤの語、Claude Code 機構名としての固有名詞)

## ピンポイント置換 vs 全面書き直しの判断

peer が採用した「ピンポイント置換」方針:
- 受け入れ条件 checkbox を最小修正で満たす (= 旧記述を残しつつ要点だけ plugin 前提に置換)
- 全面書き直しは TODO に残す (= 余裕があれば後段で実施、現状は受け入れ条件達成で十分)

本 session 側の DR / docs を正本として claude-rules-personal が参照するため、本 plugin の docs (= SKILL.md / DESIGN.md / DR-0001-3+5 / STRUCTURE.md / CHANGELOG.md) が安定していることが前提。本 session は v0.2.6 (用語掃除) → v0.2.8 (audit-docs-consistency 全完了) で参照 base を固めてから peer に rules-revision の blocked 解除信号 (= 用語掃除完了通知) を送る順序を採った。

## ハマり所と解決策

- **race 回避**: peer が claude-rules-personal を touch するときに本 session が並行で同 file を触らないよう、本 session は claude-rules-personal には触らない宣言を継続。担当分離が明確だったので conflict なし
- **用語ミスマッチ防止**: peer の rules-revision 着手前に本 session 側で用語掃除 (= 「skill」→「sub-command」全 doc 統一) を済ませる順序合意で、参照元のブレを排除
- **正本リスト共有**: peer が改訂中に参照する正本 docs の場所 (= SKILL.md / DESIGN.md / DR / STRUCTURE.md / CHANGELOG.md) を事前に明示共有し、peer の判断ブレを減らした

## 残 TODO (= peer 側で pending)

- claude-rules-personal 含む 4 リポ (bump-semver / claude-rules-personal / cmux-msg / claude-plugin-reference) の justfile に `just sync` / `just promote` task 追加 (= v0.40.0/0.40.1 適用の第二段、利用者が困ったら段階)
- rule の「全面書き直し」 (= 旧 narrative の解体 + plugin 前提への書き換え、ピンポイント置換では残った旧表記の整理)

これらは「rules-revision-after-plugin の本 issue とは別 scope」として peer 側で別途管理。

## 関連

- 改訂元 rule: `kawaz/claude-rules-personal` の `for-me/rules/docs-knowledge-flow.md` + `for-me/skills/docs-structure/SKILL.md` + `for-me/skills/docs-structure/templates/issue/YYYY-MM-DD-template.md`
- 改訂 commit: `kawaz/claude-rules-personal@9bb1ceb9`
- 本 plugin 側の正本 docs: `SKILL.md` / `docs/DESIGN.md` / `docs/DESIGN-ja.md` / `docs/decisions/DR-0001-0003+0005` / `docs/STRUCTURE.md` / `CHANGELOG.md`
- 担当 cmux-msg 履歴: 2026-06-22 18:00 〜 19:40 (= 約 1.5h)
