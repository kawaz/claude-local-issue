# 作り直し前の利用側インタビュー (2026-11-14)

plugin を mod 形式へ作り直す前に、利用側 3 プロジェクトの統括セッションへ同じ 6 問 (良い点 / 悪い点 / 直接編集の実態 / 使っていない機能 / 作り直しの方向 / 語彙の過不足) を送り、実体験に基づく回答を得た。数値は各セッションの申告で、こちらでは再計測していない。

## 回答者と経験の量

| 回答者 | 経験 |
|---|---|
| llm-gateway | 2026-11-12〜14 のセッション。open / wip 8 件、archive 68 件、他プロジェクトへの起票 1 件 |
| claude-ccmsg | 2026-11-12〜13 のセッション。list 1 回、read 2 回、write 4 回 (うち 1 回失敗)、update 7 回 (close 6、本文更新 + blocked 1) |
| workboard-personal の incubator 枝 | 2026-11-14 の write 1 件 (他プロジェクトへの起票、2 回実行)。自リポに docs/issue は無い |

## 無くなると困る挙動

| 挙動 | 挙げた回答者 | 根拠 |
|---|---|---|
| close の一連 (解決の節 → status → archive 移動 → INDEX から除去 → パス限定 commit) が 1 回で済む | llm-gateway、claude-ccmsg | archive 68 件を grep で追える。close 6 件で INDEX のずれ 0 |
| INDEX の自動反映 | llm-gateway | 8 件で INDEX と frontmatter が一致 |
| 他プロジェクトへの起票 (相手リポの記法を読まずに済む) | llm-gateway、incubator | 1 回で命名・frontmatter・INDEX・commit まで済んだ |
| list の放置日数つきの表 | claude-ccmsg | 26 件から棚卸し対象 13 件を決めた |
| blocked_by による保留 | claude-ccmsg | 保留にした issue が INDEX の並びでも動いた |
| SessionStart の件数通知 | claude-ccmsg | 引き継ぎ直後の棚卸しの動機になった (llm-gateway は「件数だけでは行動につながらない」と逆の評価) |

## 困ったこと

| 事象 | 回答者 | 内容 |
|---|---|---|
| 遅くて高い | claude-ccmsg、incubator、llm-gateway | 1 回 7〜23 秒、subagent で 6.6〜7.3 万 token。close 6 件で約 42 万 token。reject された回も約 6.6 万 token |
| write の引数の形が見えない | 3 者とも | 本文の先頭語が slug になる付け直しの commit が積まれた / 同じ形の引数が 1 回目は起票、2 回目は何も作らず終了 / 先頭 1 token が slug という決まりを reject の文で初めて知った |
| 結果が呼ぶたびに違う | claude-ccmsg | close_reason の中身がばらばら。`dr/` があるのに後続 issue の起票が省かれた回がある |
| plugin 自身への誤警告 | claude-ccmsg、incubator | write の中の Write に「write を使え」。`ls` / `grep -l` だけの Bash に「read を使え」 |
| 背景の commit が統括の操作と競合 | claude-ccmsg | INDEX を触る close は直列に出す必要があった。last_read の commit が push に同乗した |
| commit の成否が返らない | incubator | 呼び出し側が相手リポで確かめた |
| update の中で commit が相対パスの誤りで 1 回失敗 | claude-ccmsg | エージェントが自分でやり直した |
| 結果が後から通知で届く | incubator | 先に「起票中」と報告して訂正することになった |
| close のきっかけが無い | llm-gateway | 実装済みに見える issue が wip のまま残っている (実装済みかは未精査) |

## 直接編集の実態

- llm-gateway: plugin の書式でない commit が 2 つある。本文を育てる追記は Edit で直接行っている。INDEX のずれは見当たらない
- claude-ccmsg: issue と INDEX の直接編集はしていない。棚卸しの worker には read を通さず Read で 13 件を読ませた (別 workspace での last_read の commit の食い違いと、約 90 万 token になる見込みのため)
- incubator: 経験なし

## 使っていない機能

- read の last_read: llm-gateway は 8 件中 7 件が空、claude-ccmsg は記録されたが判断に使っていない、incubator は未使用
- migrate、list のフィルタ: 3 者とも未使用

## 作り直しの方向についての意見

| 回答者 | 推す形 | 理由 |
|---|---|---|
| llm-gateway | 本文は Edit / Write で直接、hook が INDEX と frontmatter を直す。起票・close・archive 移動は schema 付きの tool | 本文の追記は Edit が自然で実際にそうしている。引数で文を渡す形は誤解釈が起きやすい |
| claude-ccmsg | schema 付きの tool。食い違いは push 前の lint で検出 | 困りごとの大半は LLM に手順を実行させていることから来ている。worker が別 workspace で同時に動くので、hook の自動修正は INDEX の競合が増えそう |
| incubator | schema 付きの tool | 失敗がすべて schema と決定的な処理で消える。他プロジェクトへの起票は相手リポで hook が動かない懸念 |

共通の要望:

- 長い本文は引数でなくファイルのパスで渡す (3 者)
- tool は commit せず、変えたパスの一覧を返す。read も commit を伴わない形にする (claude-ccmsg)
- 件数だけの通知でなく「wip のまま N 日」のように名指しで出す (llm-gateway)

## 語彙と frontmatter

- category の bug / design / request で迷った場面は無い (llm-gateway)。design と idea の境目は迷う (claude-ccmsg)
- status の pending-sublimation の意味が分かりにくい (claude-ccmsg)
- 足りない: 「裁定待ち」(QUESTIONS.md のラベルを指す欄) と「条件待ち」とその条件 (claude-ccmsg)
- `*_entered` 欄が status の数だけ並び、ほとんど空で読むときの雑音になる (llm-gateway)
- close_reason は分類と根拠の参照 (finding / DR / 版) が同じ配列に混ざっている。別の欄にしたい (claude-ccmsg)
- origin に何を書くか (リポ名か、枝・セッションまでか) で迷った (incubator)
