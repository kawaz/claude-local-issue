---
title: AI の Skill tool 経由起動で context:fork の command が $ARGUMENTS を受け取らず空振りする
status: resolved
category: bug
created: 2026-07-03T17:57:34+09:00
last_read: 2026-07-31T13:34:00+09:00
open_entered: 2026-07-03T17:57:34+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-07-31T13:40:00+09:00
discard_reason:
pending_reason:
close_reason: ["implemented: 全 5 sub-command の frontmatter 直後に「実行 task (これが唯一の入力)」block を置き、$ARGUMENTS の substitution を 1 箇所に固定、command 名 / session context / TODO list からの入力補完を禁止、空引数は read/write/update が reject・list/migrate が既定操作 (commit dfee3eb)。契約テストを commands/test/run-contracts.sh に追加 (commit 03d5c81)","PoC で原因を確定 (claude v2.1.220、temp command 計 24 run): $ARGUMENTS は fork 先で展開されており ($0/$1 も含め 3/3)、表題の「fork が引数を落とす」仮説は棄却。実体は展開値が実行すべき task として認識されないことで、修正前構造 V1 は 9/9 空振り、実行 task block を持つ V2 は 8/9 実行。支配的要因は本文冒頭に実行命令があるか否か","残余は分離起票: 対策が指示遵守依存で成功率は確率的 (V2 でも 9 回中 1 回は出力形式を逸脱)、dfee3eb 後の実 command 再検証も未実施 -> 2026-07-31-fork-input-contract-compliance-is-probabilistic"]
blocked_by:
origin: hyoui セッション (a7761122) の dogfooding 観測
---

# AI の Skill tool 経由起動で context:fork の command が $ARGUMENTS を受け取らず空振りする

## 現象

AI (メインセッションの Claude) が **Skill tool** で `local-issue:list` / `local-issue:read`
を起動すると、fork 先の agent が command の固定フローを実行せず一般応答を返して終わる。
2 sub-command で 2 回再現。

- 環境: Claude Code 2.1.199 / plugin local-issue 0.2.10 / メインは Fable モデル /
  personal 面 (`~/.claude-personal`)

## 再現と観測 (2026-07-03、hyoui リポのセッションで観測)

1. `Skill(skill="local-issue:list")` (args なし)
   → 戻り値は `Skill "local-issue:list" completed (forked execution).` の後に
   **セッション開始の挨拶文** (「ご指示をお待ちしています」)。一覧処理は実行されない
2. `Skill(skill="local-issue:read", args="tx-lock-unlock-cli-subcommands")`
   → fork 先は command doc 自体は認識している応答
   (「I see the skill documentation for local-issue:read has been provided」) をしつつ、
   **「you haven't asked me to read a specific issue yet」と args が届いていない**旨を
   返して終了。last_read 記録も行われない

観測 2 から、fork 先には command 本文 (SKILL doc) は渡っているが、`$ARGUMENTS` / `$0`
の substitution が起きていない (= 空のまま) ように見える。

## 未検証の切り分け (= 担当側で裏取りしてほしい)

- **ユーザが `/local-issue:read <slug>` を手打ちした場合**に同じ現象が出るか
  (本観測は AI の Skill tool 経由のみ。手打ち経路が正常なら「AI 起動経路限定」の問題)
- 原因が plugin 側 (frontmatter の `context: fork` + `agent: general-purpose` +
  `model: haiku` の組合せ) にあるのか、Claude Code 本体の Skill tool → fork 実行の
  args 受け渡しにあるのか。後者なら本 issue は上流 (anthropics/claude-code) への
  報告に化ける可能性がある
- plugin の他 command (`write` / `update` / `migrate`) も同経路で空振りするか
  (副作用があるため本セッションでは未検証)

## 利用側で取ったワークアラウンド

hyoui セッションでは issue の read / update を直接 Read/Edit で代替した
(hook の注意は承知の上で、command 経路が壊れているため)。last_read 等の
frontmatter 更新は手動で行う必要があった。

## 部外者スタンスの注記

本 issue は hyoui セッション (部外者) からのフラグで、plugin 内部の実装は読んでいない
(commands/*.md の frontmatter と本文冒頭のみ確認)。観測も 1 セッション内 2 回のみ。
採否・原因特定は担当側で裏取りの上で判断してほしい。

## 2026-07-04 追観測 (cache-warden セッション、部外者)

同環境 (plugin 0.2.10 / Claude Code / メイン Fable / personal 面) の別セッションで
同型現象を 4 呼出で追観測。「未検証の切り分け」の update / migrate の項が埋まる:

1. `Skill(skill="local-issue:read", args="2026-07-03-docs-issue-triage-sweep")`
   → fork は read command の用途説明を返しつつ「ユーザからの明示的な指示がない場合、
   勝手に呼び出すべきではない」と no-op 終了。last_read 記録なし
2. `Skill(skill="local-issue:read", args="docs-issue-triage-sweep --repo cache-warden")`
   → fork は「I've received the system context ... but I don't see a specific task」と
   no-op 終了 (この回は command doc への言及すらなし)
3. `Skill(skill="local-issue:update", args="docs-issue-triage-sweep --status wip --repo cache-warden")`
   → **書込系での副作用を観測**。fork は `--status wip` を list 的フィルタと誤解釈
   (「status: wip の issue は 0 件」と報告) した上で、単一 issue スコープを離れ、
   メインセッションの ambient context (task list の「13 件 triage 棚卸し」) から任務を
   推測して **13 issue 全件の triage + status 変更 + close 2 件 + 新規起票 1 件 +
   INDEX 書換 + commit 2 件** を実行した。結果は監査の上で採用できる品質だったが、
   update.md の単一 issue スコープ契約は破られている
4. `Skill(skill="local-issue:migrate", args=なし)` → 正常動作 (9 file 正規化 + INDEX
   再生成 + path 限定 commit)。args 不要 command かつ直前会話が migrate 文脈だった
   ため、$ARGUMENTS 欠落の影響を受けなかったと解釈できる

観測からの示唆 (裏取りは担当側で):

- $ARGUMENTS 非伝搬は haiku (read/list) に限らず sonnet (update) でも起きる
- model tier で症状が分岐する模様: haiku fork は一般応答で no-op、sonnet fork は
  ambient session context から任務を創作して実行する
  (= **書込系 command では意図しない大規模副作用のリスク**)
- fork には session context (task list / 直前会話) が見えている。command 本文は
  見える場合と見えない場合がある (観測 1 は用途説明あり、観測 2 はなし)

利用側 workaround: cache-warden セッションでは read/update の契約 (last_read 記録 /
path 限定 commit / 単一 issue スコープ) を手動で踏んで代替した。

### 2026-07-06 追記 (同セッション、挙動変化の観測)

同じ plugin 0.2.10 のまま、`local-issue:write` の fork が **$ARGUMENTS を正しく受け取る**
ようになっていた (2 呼出で確認):

1. `Skill(skill="local-issue:write", args="<slug> --repo cache-warden")` (body なし)
   → fork は slug と --repo を認識した上で「body が空」と **正しく validation reject**
   (勝手に本文を創作しない旨まで明言)
2. body 込みの再呼出 → 正常起票 (frontmatter / INDEX / path 限定 commit まで契約どおり)

2026-07-04 の観測 (read×2 no-op / update の全面誤動作) との差分は plugin version では
なく、セッションの Claude Code process 再起動を複数回挟んだこと。**fork への
$ARGUMENTS 伝搬は harness 側要因 (バージョン / 状態依存) の可能性が高まった**。
裏取りは担当側で (Claude Code の version 変化と突き合わせると切り分けが進むはず)。

### 2026-07-28 追観測 (kawaz/kuu セッション、部外者)

同型現象を継続観測。頻度データが追加された:

- 約 9 回の invoke 中 3 回で発生 (read×2, list×1)。args の書式は key=value 形式
  (`project=... slug=...`) でも自然文でも発生し、**同内容で再 invoke すると成功する
  (再現は確率的)**
- write は正常動作を維持 (2026-07-06 追記の観測と整合)

ワークアラウンド: 空振りしたら同 args で再 invoke、read の代替は直接 Read
(last_read 更新が失われる欠点あり)。

確認観点のフラグ (裏取りは担当側で):

- fork 実行された subagent の transcript 冒頭に args が含まれるか。含まれないなら
  harness 側 issue の可能性が高い
- 発生率が特定の呼び出しパターン (list vs read vs write) に偏っているか

## 切り分けの結論 (2026-07-31)

蓄積した観測を突き合わせると、本 issue には **別要因の 2 現象** が混在していた。
両者を分けないと「直った / 直っていない」が判定できないため、まず分離する。

### 現象 1: fork 先が ambient な session context から任務を創作する (= plugin 側)

2026-07-04 観測 3 が最も明確な実例:
`update --status wip` が list 的フィルタとして誤解釈された上で、fork 先が
メインセッションの task list (「13 件 triage 棚卸し」) を任務と読み取り、
**単一 issue スコープを離れて 13 issue の一括処理 + close 2 件 + 新規起票 1 件 +
commit 2 件** を実行した。

これは args が届かなかったこと自体ではなく、**args が無いときに周辺文脈で
入力を埋める余地が command 定義側に残っていた**ことが原因。当時の commands/*.md は
`## 入力 ($ARGUMENTS)` という見出しで仕様の途中に substitution token を置いており、
「今このターンで実行すべき task は何か」を一意に固定する記述が無かった。

### 現象 2: 展開された引数が「実行すべき task」として認識されない (= これも plugin 側)

観測されてきた挙動:

- 2026-07-06 追記: plugin version 据え置きのまま `write` の伝搬が**正常化**した
  (差分は Claude Code process の再起動)
- 2026-07-28 追観測: 約 9 回中 3 回で発生し、**同内容で再 invoke すると成功する**
  (= 確率的、args の書式に依存しない)

本 issue の表題は「fork が引数を落とす」だが、**この字義どおりの仮説は PoC で棄却された**
(下記)。実体は「`$ARGUMENTS` の展開は起きているが、展開された値が subagent にとって
**実行すべき task として認識されない**」であり、修正箇所は harness ではなく
command 定義側にある。

#### PoC による裏取り (2026-07-31、claude v2.1.220)

本リポと plugin cache を変更せず、temp project の `.claude/commands/` に
`context: fork` / `agent: general-purpose` / `model: haiku` の検証用 command を置き、
`claude -p '/<cmd> <args>'` で計 24 run 実行した結果:

| 検証 | 構造 | 結果 |
|---|---|---|
| 逐語 echo probe | 本文を逐語出力させる | **3/3 で展開**。`$ARGUMENTS`=`alpha bravo`、`$0`=`alpha`、`$1`=`bravo`。説明文の途中に置いた `$0` も展開された |
| V1 (修正前構造) | 引数が `## 入力 ($ARGUMENTS)` 節と条件文の中にしか現れない | **9/9 で空振り**。引数あり / なし / 解釈不能のいずれでも「実行すべき task が見当たらない」旨を返して終了し、フローを 1 歩も実行しない |
| V2 (修正後構造) | 冒頭に明示 task 行 (「受け取った引数: … 上記を対象に実行せよ」) | **8/9 で実行** (引数あり 3/3、引数なし 3/3 で正しく空判定、解釈不能 2/3) |

確定した結論:

1. **引数は fork 先に届いている**。harness が引数を落としているのではない
2. **支配的要因は「本文冒頭に実行を促す命令があるか否か」**。V1 構造は本文全体を
   「仕様のダンプ」と読んで停止する失敗モードを持ち、9/9 で再現する
3. 引数が空のとき `$0` が **command 名に補完される揺れ**も観測された (3 回中 1 回、
   `/v3` の `$0` が `v3` になった)。「command 名から補完しない」規定が必要なことの裏付け

なお PoC は temp command による対照実験であり、本リポの実 command 同士
(read/list vs update/write) を実行比較したものではない。「read/list だけが壊れて
見えた」件の解釈は下記のとおり別の説明が付く。

#### 「read/list だけが壊れている」に見えた件

2026-07-28 の別報告 (`read-list-fork-invocation-drops-args`) は、read/list が
空振りし update/write が正常だったことから「command 定義のプロンプト構成に
差があるのでは」という仮説を立てていた。突き合わせた結果、この仮説は否定される:

- 当時の 5 command は `## 入力 ($ARGUMENTS)` という**同一の構成**で、read/list だけが
  不利になる差分は無かった (= 差分は `model` / `effort` / `allowed-tools` のみ)
- 2026-07-04 の観測では **update でも** 伝搬失敗が起きている (現象 1 の実例)。
  read/list 固有ではない
- 2026-07-28 自身の観測が「同 args で再 invoke すると成功する」= 確率的と記録している

read/list に偏って見えたのは、**症状の見え方が model tier で分岐する**ためと解釈できる:
低 tier の fork (read/list) は一般応答で no-op 終了するので「空振り」として目立ち、
高 tier の fork (update/write) は文脈から任務を創作して**完走してしまう**ため、
呼び出し側からは一見「正常動作」に見えていた (2026-07-04 観測 3 が実例で、
実際には契約違反の大規模副作用が起きていた)。

いずれにせよ入力契約は 5 command 全部に同形で入れたので、command 間の差は残っていない。

## 修正内容 (現象 1)

全 5 sub-command (`read` / `list` / `write` / `update` / `migrate`) の frontmatter
直後に「実行 task (これが唯一の入力)」block を置き、そこだけで `$ARGUMENTS` を
substitute する形に統一した:

- 引数行を **唯一の入力**と宣言し、command 名 / ファイル名 / session context /
  TODO list / 直前の会話 / 他 agent の作業内容からの**入力補完を明示的に禁止**
- 引数行が空なら「引数なし」という**文字列としての事実**として扱う。
  `read` / `write` / `update` は即 reject、`list` / `migrate` は宣言済みの既定操作を実行
- 位置引数の文法 (先頭 1 token が slug、以降は flag) を明記して**正当な引数形を
  過剰 reject しない**ようにし、未知 flag / 2 つ目以降の位置引数は reject
- `--repo` 省略時の root 解決に cwd fallback を明記

この構造は PoC の V2 (= 8/9 で実行) そのものであり、V1 が 9/9 で踏んでいた
失敗モード (本文全体を仕様ダンプと読んで停止する) を「引数行より下の記述は
仕様であって入力ではない」の一文で直接塞いでいる。空引数時の `$0` の
command 名補完も「command 名 / ファイル名から補完しない」で名指しで禁止した。

## 検証結果

`commands/test/run-contracts.sh` に静的 invariant の回帰を追加し、`just test` で
全 5 command について以下を固定 (46 pass / 0 fail):

- 「実行 task」block が**ちょうど 1 つ**存在する
- `$ARGUMENTS` の出現が**ちょうど 1 箇所** (= substitution 箇所が分散しない)
- 「唯一の入力」「補完しない」「reject」の各文言が存在する
- 引数必須 command (`read` / `write` / `update`) は空引数を「即 reject」と規定
- 既定操作を持つ command (`list` / `migrate`) は空引数でも既定操作を実行と規定

指示書 (= LLM への自然言語 prompt) は振る舞いそのものを再実行できないため、
固定できるのは「壊れると即事故になる文言」までである点は割り切り。

## 残余

**再現条件は塞いだが、構造的な完全解決ではない**。対策は指示遵守に依存するため
成功率は確率的で、PoC の V2 構造でも 9 回中 1 回はフローを実行しつつ出力形式を
外した (= 手順を復唱した)。また dfee3eb 後の**実 command での再検証は未実施**。

この残余は `2026-07-31-fork-input-contract-compliance-is-probabilistic` として
分離起票した (回帰の検出手段の見通しも含む)。
