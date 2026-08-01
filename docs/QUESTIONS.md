# 裁定・確認待ち一覧 (ユーザ用)

## 運用規約

<details>
<summary>ゼロコンテキストエージェント向け（本セクションは消さない）</summary>

- 裁定/確認待ち項目を 1項目=1ラベル=1セクション で記載
- ラベル形式: XX-Q1（XX は 2-3 文字、バッチやセッション内で一意、Qn単独の使い回し禁止、長期一意性は不要)
- 依頼形式: 「👺XX-Q1 の裁定お願いします」（参照用途ではラベルに👺を付けない。誤陽性がユーザのハイライト/アラームを汚す）
- チャット提示と同一ターンで本ファイルに記録 + path 指定 commit (push はリリース窓に同乗)
- 裁定が下りたら該当セクションを即削除し、内容は正規の記録先 (DR / issue / journal / close_reason) へ反映。本ファイルは常に「現在待ち」だけを持つ
- 参照は[]()で提示（リポ内は相対、リポ外はフルパス）
- 初版質問/依頼は長文で書かない（ユーザが説明を求めらたら本ファイルに説明を追加し、チャットで👺ラベルで再依頼）
- **選択肢・確認項目は `- [ ] a: …` 形式（チェックボックス + ラベル）で書く**。
  Q / C で記法を分けない。回答は「チェックを付ける」でも「XX-Q1a」と言葉で返すでも通る
  （複数まとめてチェックし「チェックしたよ」の一言で済ませる運用を想定）

</details>

## 裁定待ち

### 👺LI-Q1: bump-semver への上流起票を push するか

- [ ] a (推奨): push する
- [ ] b: push しない (kawaz が内容を見てから判断)

起票済み (ローカル commit のみ): `/Users/kawaz/.local/share/repos/github.com/kawaz/bump-semver/main/docs/issue/2026-07-31-vcs-commit-allow-nonexistent-path-hint-drops-deletions.md` (commit `578d187`)

推奨理由: 内容は実機再現済みの事実と「状況証拠にとどまる」旨の明示で構成しており、部外者起票として過不足がない。先方リポは kawaz 自身の管理下。

### 👺LI-Q2: worktree 誤認 ([issue](./issue/2026-07-10-worktree-cwd-repo-misresolution.md)) をどう直すか

- [ ] a (推奨): 現仕様を維持し「`--repo <name>` は必ず main を指す、worktree は絶対パスで渡す」を各 command に明記
- [ ] b: `--repo <name>:<workspace>` のような worktree 指定構文を足す
- [ ] c: name 解決時に worktree/workspace も探索して候補が複数なら reject

推奨理由: name はリポの識別子であって作業場所の識別子ではない。b/c は name に作業場所の意味を後付けすることになり、`~/.local/share/repos/.../main` 規約自体との整合が崩れる。a なら既存規約のまま曖昧さだけを消せる。

## 確認待ち

### 👺LI-C1: v0.2.11 (優先 3 件の修正) の内容

- [ ] a: close の完了条件を `bump-semver vcs is clean` にし、dirty 時は成功報告せず停止する仕様でよいか ([commands/update.md](../commands/update.md))
- [ ] b: INDEX の順序維持を「対象行だけ canonical 位置へ再配置」とし、全体整列は migrate 専任のままでよいか ([templates/index.md](../templates/index.md))
- [ ] c: 実 command を叩く probe を `just test` に入れず `just probe-fork` に分離した判断でよいか ([commands/test/run-fork-probe.sh](../commands/test/run-fork-probe.sh))
