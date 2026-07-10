---
title: worktree 越境利用時に対象リポを誤認する (セッション cwd 優先の解決が原因か)
status: open
category: bug
created: 2026-07-10T12:22:19+09:00
last_read:
open_entered: 2026-07-10T12:22:19+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: LaserGuideV3 (クロスプロジェクト起票、部外者フラグ)
---

# worktree 越境利用時に対象リポを誤認する (セッション cwd 優先の解決が原因か)

## 概要

別リポ (LaserGuideV3) を cwd とするセッションから、git worktree
(`/Users/kawaz/.local/share/repos/github.com/kawaz/LaserGuide/wip-v3`) の
`docs/issue/` を read/update しようとしたところ、skill がセッション cwd 側の
リポを見に行き、worktree 側の issue を認識できなかった、というサブエージェント
の報告があった (2026-07-10、LaserGuide v3 立ち上げセッション)。当該サブエージェント
は frontmatter を手動編集する形で回避した。

一方、同セッションで親側から args に絶対パスを明示した write/update は成功
している (成功例: LaserGuide/wip-v3 への 2 件起票と 1 件 update)。このため、
「args でのパス明示があれば動くが、明示の仕方や呼び出し文脈 (fork 経由の
サブエージェント起動等) によっては cwd 解決に落ちる」可能性がある。

## 背景

これは部外者 (LaserGuideV3 側の作業セッション) からのフラグであり、一次情報は
LaserGuide v3 セッションの focus-flash worker 最終報告 (2026-07-10) のみ。
観測は伝聞混じり (= 部外者セッションが直接 local-issue plugin の内部実装を
確認したわけではない) なので、事実として断定はできない。再現確認してから
採否を判断してほしい。

再現確認の候補:
- worktree ディレクトリ (bare + 複数 worktree 構成) + 別 cwd のセッションで
  read/update/write を試す組合せ
- args のパス明示のしかた (相対パス / 絶対パス / repo 名指定) ごとの解決結果差
- fork 経由のサブエージェント起動時に args がどう伝播するか (2026-07-03 起票済み
  の `skill-tool-fork-invocation-drops-arguments` issue と関連する可能性もあるため
  合わせて確認)

## 受け入れ条件

- [ ] worktree + 別 cwd の組合せで実際に誤認が再現するか確認した
- [ ] 再現する場合、原因 (cwd 優先の解決ロジックか、他の要因か) を特定した
- [ ] 再現しない場合、または該当なしと判断した場合はその根拠を記録した
- [ ] 対応が必要と判断した場合、repo/cwd 明示指定オプションの追加 or ドキュメント
      明記などの対応案を決定した

## TODO

<!-- wip 時のみ -->
