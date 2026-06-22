---
title: docs 整合性 + DR 番号付け直し + 翻訳 freshness の CI 強制
status: wip
category: task
created: 2026-06-20T00:33:30+09:00
last_read:
open_entered: 2026-06-20T00:33:30+09:00
wip_entered: 2026-06-22T18:53:20+09:00
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: ペルソナ監査 (TechWriter) からの集約 issue
---

# docs 整合性 + DR 番号付け直し + 翻訳 freshness の CI 強制

## 進捗 (2026-06-22)

用語掃除 (skill → sub-command) は v0.2.6 (commit 4fa1577) で完了。

掃除した範囲:
- hook script 内の「skill」表記
- SKILL.md 内の「skill」表記
- DESIGN.md 内の「skill」表記

保持した固有名詞:
- `SKILL.md` ファイル名自体
- `skills/` ディレクトリ名
- Claude Code の「skill」概念を指す固有名詞としての使用箇所

残作業は以下の 3 つに絞られた:
- DESIGN.md 英訳完全同期
- CHANGELOG 整備
- CI に check-outdated-translations 組込み

## 概要

ペルソナ監査 (TechWriter エンジニア視点) で複数指摘された **DESIGN.md (英/日) の同期欠落**、**DR 番号の欠番管理**、**翻訳ペアの freshness 監視を CI で強制** を v0.3.0 規模で対応する。

## 背景

ペルソナ監査 (TechWriter) から以下の重大級指摘が集約された。

### 1. DESIGN.md (en) と DESIGN-ja.md の同期欠落

英版から以下が欠落:
- 「発展形」(= claude-rules-personal の docs-knowledge-flow / docs-structure の発展) という出自文脈
- `discarded` / `resolved` status (= status enum 5 値で説明、実際は 7 値)
- commands / skills / agent の使い分け section (= DR-0001)
- close と archive section (= DR-0002 の核心)

### 2. DR 番号管理 (= DR-0004 欠番)

DR-0001 / 0002 / 0003 / 0005 と続き DR-0004 が存在しない。INDEX.md にも記載なし。
- **方針案**: INDEX.md に「DR-0004 は欠番 (= stale-days/count-threshold 確定時に予約)」を明記
- または DR-0004 を「9cell-trial 評価経緯の meta DR」として埋める

### 3. DESIGN.md の `Open (to settle through use)` 項目が古い

- repo-name resolution は SKILL.md で確定済 (= 「未確定」から削除)
- stale-days / count-threshold は分離 issue が立っている (= リンクへ置換)

### 4. justfile の `check-outdated-translations` を CI 必須に

現状 `ci` task は `lint test` のみで `check-outdated-translations` を呼ばない (= `push` task でしか呼ばれない)。`ci: lint test check-outdated-translations` に変更し、`bump-semver vcs outdated` の glob を README / DESIGN / SKILL の全英訳ペアに拡張。

### 5. 「skill」表記 → 「sub-command」への用語統一

DR-0003 で commands に統一したが、hook script / SKILL.md / DESIGN.md 内に「skill」表記が残る。検索置換で「sub-command」または「command」に統一。

### 6. SKILL.md / STRUCTURE.md の重複表 (frontmatter audience)

両方に同じ 4 行表が存在 (= 片方放置の race)。STRUCTURE.md は SKILL.md / DR-0003 への link に置き換え。

## 受け入れ条件

- [ ] DESIGN.md (英) を DESIGN-ja.md と完全同期
- [ ] DR-0004 を INDEX.md で reserved として明記
- [ ] 用語「skill」→「sub-command」を全 doc で統一 (固有名詞除く)
- [ ] justfile ci に check-outdated-translations 組込み
- [ ] CHANGELOG.md 新設、v0.1.0+ の履歴整備
- [ ] SKILL.md / STRUCTURE.md の重複表を解消

## TODO

<!-- wip 時のみ -->

- [ ] Phase 1: DESIGN.md 英訳同期 (DESIGN-ja.md を正本として全面書き直し)
- [ ] Phase 2: DR 番号管理 (INDEX.md に DR-0004 reserved 明記)
- [ ] Phase 3: 用語統一 (skill → sub-command、grep -r で全 .md / .sh 検出)
- [ ] Phase 4: justfile ci に check-outdated-translations 組込み
- [ ] Phase 5: CHANGELOG.md 新設と v0.1.0〜v0.2.4 の履歴整備

## 解決時の記録先

- 単純なコード修正のみ: 記録不要 (commit message で足りる)
- 設計判断を伴う: decisions/DR-NNNN-...md
- 運用上の再発可能性: runbooks/<topic>.md
- 経緯・ハマり所: journal/YYYY-MM-DD-<slug>.md

close 時はこのファイルを docs/issue/archive/ へ移動する(削除しない。経緯を DB として残す)。
