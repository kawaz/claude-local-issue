---
title: ペルソナ監査の軽微改善集約 (= nitpick / improvement)
status: idea
category: task
created: 2026-06-20T00:35:29+09:00
last_read:
open_entered:
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: ペルソナ監査 3 名 (TechWriter/Security/QA) からの軽微改善集約
---

# ペルソナ監査の軽微改善集約 (= nitpick / improvement)

## 概要

ペルソナ監査 3 ペルソナの軽微改善・重箱の隅指摘を集約。優先度低、運用観察と並行して個別判断 / 採否で進める。

## 背景

ペルソナ監査 (TechWriter / Security / QA) の結果、Critical/Warning は別 issue に切り出し済み。本 issue は残りの Info / Nitpick を「忘れないための引き出し」として保持する。

### TechWriter (軽微)

- SKILL.md description 165 文字超、1 文に複数責務 (= 1-2 文圧縮)
- 「fork 下」「path 限定 commit」「bump-semver vcs commit」が初出時に説明なし → README に Glossary
- 「scope = 1 件」「発火スコープ = 作業スコープ」が初出説明なし、英訳の `firing scope = work scope` が直訳で意味不明
- SKILL.md の status 遷移図がテキスト矢印で読みにくい (= ASCII art / 表へ)
- README-ja の「(重要)」マーカーが英版にない
- close_reason prefix 一覧が表で網羅されていない (= 表化)
- SKILL.md:124 で DR-0003 / DR-0005 リンクなし
- marketplace.json:12 description が日本語のみ → bilingual

### Security (Info)

- I1: hook script に `umask 077` 設定なし (一時ファイル未使用なので現状 OK、将来防衛)
- I2: SessionStart hook の `count` 値が空文字に縮退するケース防御 (= `${count:-0}`)
- I3: hook matcher が `*` で per-tool 発火、`Read|Write|Edit|Bash` glob alternation 検証
- I4: plugin.json / marketplace.json の version 同期 lint
- I5: CHANGELOG 不在 (= audit-docs-consistency 側で対応)
- I6: bump-semver 還元起票の追従 (= 既起票済み)
- I8: `Skill` ツール経由でも nudge 発火するループ防御 (= self-suppress)
- I9: クロス account commit author 検証 (= write/update 内で `git config user.email` 確認)
- I10: env 値 numeric validation (= v0.2.4 で count-threshold は対応済、他にも適用要)

### QA (Info + Nitpick)

- I1: templates/issue.md の `## 解決時の記録先` 削除 (= v0.2.4 で対応済、本 issue では扱わない)
- I4: list の `--stale-days` と `--unread-only` の AND/OR 曖昧
- I5: write skill に「INDEX.md は Edit append」明示 (= DR-0005 Q2 と整合)
- I7: lint-skills が「先頭 ---」だけ check (= YAML 完全 parse へ)
- I8: hook 内コメント「TaskCreate 等」→ 「Agent / Glob / AskUserQuestion 等」更新
- I9: migrate の `git log --diff-filter=A` が jj 環境で動くか empirical-verification
- I10: discard_reason / pending_reason の string[] 形式 migrate での吸収ロジック
- I11: `date -Iseconds` の BSD date 非互換 (CI Linux 想定)
- I12: bump-semver 未インストール時の graceful failure
- I13: close commit → 後続起票 commit の順序明示固定
- I14: archive 移動の冪等性 (= 同 slug 2 回 close で `archive/<file>` 既存時の挙動)
- I15: templates/index.md `{{rows}}` プレースホルダ仕様の write skill での参照
- N1-N12: 細部 (matcher syntax canonical 確認 / commit msg 命名 / 表記揺れ等)

## 実装方針

優先度低なので、運用で気になったら随時 1 件ずつ patch。集中対応より分散対応が向く。本 issue は「あとで思い出すための引き出し」として idea で残す。

## 受け入れ条件

- [ ] 上記項目を運用観察と合わせて適宜消化、5 件以上消化したら本 issue を再評価 (= 残項目を split or 本 issue 自体を discard)

## 関連

- audit-hook-robustness-and-test-coverage (= Critical/Warning の対応 issue)
- audit-docs-consistency-and-translation-freshness (= TechWriter 重大の対応 issue)
- v0.2.4 で対応済の軽微項目 (= 一部は本 issue から除外済)
