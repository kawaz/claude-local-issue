---
title: fork 入力契約の遵守が確率的で、修正後の実 command 再検証が未実施
status: resolved
category: bug
created: 2026-07-31T13:52:00+09:00
last_read: 2026-08-01T09:06:47+09:00
open_entered: 2026-07-31T13:52:00+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-08-01T09:06:47+09:00
discard_reason:
pending_reason:
close_reason: ["verified","実 command 45 run で契約遵守 44/45・空振り 0、live probe (just probe-fork) を追加、出力形式の逸脱は許容と判断"]
blocked_by:
origin: 2026-07-03-skill-tool-fork-invocation-drops-arguments (close 時の残余分離)
---

# fork 入力契約の遵守が確率的で、修正後の実 command 再検証が未実施

## 概要

`2026-07-03-skill-tool-fork-invocation-drops-arguments` は、全 5 sub-command に
「実行 task (これが唯一の入力)」block を置く入力契約 (commit dfee3eb) で close した。
ただしこの対策は **LLM の指示遵守に依存する**ため、効果は確率的で 100% ではない。
close 時点で残っていた 2 点をここに分離する。

1. 契約を満たす構造でも、フローを実行しつつ**出力形式を外す**ことがある
2. dfee3eb 適用後の **実 command での再検証が未実施** (PoC は temp command による対照実験)

## 背景

PoC の確定観測 (2026-07-31、claude v2.1.220、temp project の `.claude/commands/` に
`context: fork` / `agent: general-purpose` / `model: haiku` の検証用 command、計 24 run):

| 構造 | 結果 |
|---|---|
| 逐語 echo probe | 3/3 で `$ARGUMENTS` / `$0` / `$1` が展開 (= 引数は fork 先に届いている) |
| V1 (修正前構造。引数が `## 入力 ($ARGUMENTS)` 節と条件文にしか現れない) | **9/9 空振り**。フローを 1 歩も実行せず質問して終了 |
| V2 (修正後構造。冒頭に明示 task 行) | **8/9 実行**。引数あり 3/3、引数なし 3/3 (正しく空判定)、解釈不能 2/3 |

V2 の残り 1 回は「フローは実行したが手順を復唱して出力形式を外した」もので、
空振り (V1 の失敗モード) への退行ではない。つまり **失敗の質は下がったが、
ゼロにはなっていない**。

また、引数が空のとき `$0` が command 名に補完される揺れも観測されている
(3 回中 1 回、`/v3` の `$0` が `v3` になった)。dfee3eb はこれを「command 名 /
ファイル名から補完しない」で名指し禁止しているが、これも指示遵守依存である。

## 受け入れ条件

- [x] dfee3eb 適用後の**実 command** (`read` / `list` / `write` / `update` / `migrate`)
      で、引数あり / なし / 解釈不能の各条件を複数回実行し、契約どおりの挙動
      (実行 / 正しい空判定 / reject) になる比率を実測する
- [x] V1 型の退行 (= 空振り) を自動検出する手段を用意するか、見送るなら理由を記録する
- [x] 出力形式の逸脱が実運用で問題になる頻度かを判断し、許容するなら割り切りとして記録する

## 実測 (2026-08-01、plugin v0.2.11、claude v2.1.220)

使い捨て git repo (fixture: active issue 3 件 + frontmatter 欠落の旧形式 1 件 + INDEX.md) を
run ごとに複製し、`claude -p '/local-issue:<cmd> <args>' --permission-mode acceptEdits` を
別プロセスで実行。5 command × 3 条件 × 3 回 = 45 run。

| command | 引数あり | 引数なし | 解釈不能 |
|---|---|---|---|
| read | 3/3 実行 (うち 1 は commit 手段を逸脱、下記) | 3/3 reject | 3/3 reject |
| list | 3/3 実行 | 3/3 既定操作 (全件一覧) | 3/3 reject |
| write | 3/3 実行 (起票 + INDEX + commit) | 3/3 reject | 3/3 reject |
| update | 3/3 実行 (status 遷移 + INDEX + commit) | 3/3 reject | 3/3 reject |
| migrate | 2/3 実行 (1 は `--dry-run` 違反、下記) | 3/3 既定操作 (実適用 + commit) | 3/3 reject |

- **空振り (V1 型の失敗モード): 0/45**。フローを 1 歩も実行せず質問して終了した run は無い
- **ambient context 由来の操作: 0/45**。全 run で `git diff` は当該 command が触るべき path
  だけ (fixture には他に active issue が 3 件あるが、どの run も巻き込んでいない)
- 引数なしの reject / 既定操作の振り分けは 15/15 で正しい (read / write / update は reject、
  list / migrate は既定操作)

### 契約から外れた 2 run

- `migrate --dry-run` (3 回目): dry-run 中に実際に Write を行い、自己申告のうえ元の内容を
  書き戻して復旧。最終状態は clean で観測上の差分ゼロだが、**やってはいけない操作を実行した**
  点で逸脱。復旧が Write による手動再現だったため、他の未コミット変更があれば壊し得た
- `read <slug>` (1 回目): 固定フローが指定する `bump-semver vcs commit` ではなく素の
  `git commit` を使い、`allowed-tools` に無いため承認ゲートで止まった。last_read の Edit は
  済んでいて commit だけ未了、という中途状態で報告。**失敗の質としては空振りより軽く、
  未完了であることは報告されている**

### 周辺 context との綱引き

「alpha-issue の対応を進めている。次は alpha-issue を wip にする」と書いた `CLAUDE.md` を
fixture に置き、引数なしで read / update / write を各 3 回 (計 9 run)。**9/9 で reject**、
alpha-issue を触った run は 0。1 run は「CLAUDE.md の記載から対象を補完することは禁止されている」
と明示して拒否した。周辺 context が具体的な対象を名指ししていても契約が勝つ。

### 出力形式

45 run のうち約 1/3 で報告フォーマットからの逸脱があった。内訳は全て **加算方向**:

- 手順の実況・処理内容の後付け説明を報告の前後に足す
- `list` の slug 列にファイル名 (`2026-07-01-alpha-issue`) を入れる
- `read` の全文ダンプで空フィールドを省く
- 「推奨次アクション」等の余計な提案行を足す

**割り切りとして許容する**。報告の消費者は呼び出し元 LLM であって parser ではなく、
逸脱はいずれも必要な情報を落とさない加算。機械可読性を要求するなら報告を構造化出力に
変える必要があるが、現状それを必要とする消費者がいない。

### 検証中に踏んだ罠 (harness 側、plugin の欠陥ではない)

`claude -p '/cmd'` は **stdin が開いていると、その内容を prompt に連結して `$ARGUMENTS`
に混ぜる**。実測: `echo 'ZZQQ_STDIN_MARKER_7788 gamma-issue' | claude -p '/local-issue:read'`
→ gamma-issue を読了して commit。最初の測定はループの stdin が条件表ファイルに繋がったまま
だったため全 run が汚染されていた。実 command を叩く検証は `< /dev/null` が必須
(`commands/test/run-fork-probe.sh` にコメント付きで固定済み)。

## 回帰検出

`commands/test/run-fork-probe.sh` (= `just probe-fork`) を追加。使い捨て fixture に対して
15 条件を実プロセスで叩き、副作用のある正常系は commit の有無、読み専 / dry-run は出力
マーカー + repo 無変更、reject 系は repo 無変更で判定する。空振りはどの経路でも fail になる。

`just test` には**入れない**:

- 1 条件 = 実 model セッション 1 本 (課金 + 数十秒)、15 条件で数分
- 判定対象が確率的なので CI に入れると本質的に flaky
- `commands/*.md` を編集した時にだけ回せば足りる (静的 invariant 側は
  `run-contracts.sh` が `just test` で常時見ている)

実行例: `just probe-fork` (15 run) / `just probe-fork --reps 3` (45 run、率を出す時)。
追加時の実測は 15/15 pass。
