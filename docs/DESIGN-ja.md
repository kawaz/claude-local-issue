# 設計 (claude-local-issue)

> [English](./DESIGN.md) | 日本語

判断の記録は [DR-0006](./decisions/DR-0006-direct-edit-with-mod-normalization.md)。この文書は今の形を説明する。

## 目的

kawaz のリポ群で `docs/issue/` の INDEX と status 管理の型を揃える。issue ファイルの直接編集を禁じることは目的に含まない。

増やしたくないもの:

- LLM が実行する散文の手順書 (決定的にできる処理を model に実行させる経路)
- issue の状態を持つ場所。状態は各ファイルの frontmatter だけが持ち、INDEX はそこから導く生成物
- plugin が作る commit。いつ commit するかは作業しているセッションが決める
- 常時 context に載る説明 (tool の description、skill の一覧)

## ドメイン

issue は 1 件 1 ファイル (`docs/issue/YYYY-MM-DD-<slug>.md`)。運用は GitHub flow のような厳密な管理ではなく、自リポの TODO・他プロジェクトからの依頼・セッションを跨ぐメモを置く一段ゆるいもの。

- **status**: `idea` / `open` / `wip` / `blocked` / `resolved` / `discarded`。`blocked` は理由 (`blocked_by`) を、`resolved` / `discarded` は分類 (`close_reason`) と任意の根拠の参照 (`close_ref`) を伴う。`blocked_by` と `close_ref` は日本語 30 文字相当まで (ASCII の文字は 0.5 と数える) で、INDEX のセルに段落でなく理由か名前として収まる長さにする
- **category**: `idea` / `bug` / `request` / `design` / `task` / `tech-memo`。書く側が決め、plugin は enum かどうかだけを見る
- **created**: 起票日。放置の目安はこれだけで、status が変わった時刻は記録しない
- **origin**: 依頼元のプロジェクト (他プロジェクトからの起票の時)
- **本文**: frontmatter より後ろ。agent が自由に育て、plugin は 1 byte も変えない

close した issue は `docs/issue/archive/` に同じ名前で置き、経緯の記録として残す。

## アーキテクチャ

### 構成

plugin は Claude Mods の hooks module 1 つだけを持つ (`hooks/register.ts`)。command・classic hook・skill・テンプレート・tool は持たない。agent は issue ファイルを Read / Write / Edit / Bash で直接扱い、mod は後から形を揃える。

- `hooks/issue.ts`: 判断の部分。frontmatter の正規化、INDEX の文面、一覧の差分、監視に足す引数と書く条件、知らせの文面。`$` に触れない純粋な関数なので、bun test で直接検査する (`test/`)
- `hooks/register.ts`: `$` を通して読む・書く・知らせる部分。engine の `$` と、メモリ上のファイルシステムなどの代役で駆動して検査する (`tests/`、`claude plugin test`)

frontmatter の読み取りは `欄: 値` の行を読む小さな parser で、YAML や schema のライブラリを使わない。hooks module が import できるのは相対パスのファイルと `claude-code` だけで、ライブラリを使うには bundle が要る一方、扱う形は 8 つの既知の欄を持つ平たい行の並びだけだから。読み方 (引用符、コメント、欄の名前の大文字、複数行の値、触れずに指摘するファイル) は README の「frontmatter」の節。

### 検出

- 監視する場所は、セッションの作業ディレクトリの `docs/issue/` と、書き込みうる tool の引数 (Write / Edit の `file_path`、Bash のコマンド) に現れた別の場所の `docs/issue/`。Read では足さない。場所は実パスで持つ
- 作業ディレクトリの `docs/issue/` は全体を揃える。`session.start` で全ファイルを一度正規化し、以後はそこでの変化 (手で書き換えた `INDEX.md` も含む) があれば通す
- 別のリポの `docs/issue/` は、そのリポで起動したセッションの持ち場。名指された時は `next(e)` の前にその時点の状態を記録するだけで何も書かず、以後も tool の実行前ごとに記録し直す。tool の実行後は記録と違うファイル (変わった・消えた) だけを正規化・close し、その時だけ INDEX を作る。読んだだけ・名前が出ただけで何も変えていなければ 1 byte も書かない。呼び出しの前に無かった場所は空から始めるので、tool がそこに作ったものは変化として扱う
- `tool.call` で `next(e)` の後、各場所の一覧 (名前・size・mtime) を取り直し、変わったものだけ読んで hash を比べる。中身が変わったファイルだけを正規化し、通す必要のある場所の INDEX を作り直す。main と subagent の tool の両方が対象
- 修復は tool の結果を返す前に同期で終える。返した後に直すと、engine が「読んだ後に変更された」として Write の上書きを失敗させるため。同期で直すと engine が変化に気づき agent の既読状態を更新するので、続く Edit は失敗しない
- 同時に走った tool の検査は 1 本ずつ順に行う。書き戻す直前と archive へ移す直前に読み直し、判定した時から変わっていたら新しい内容でやり直す
- 1 つのファイルの読み書きに失敗しても、残りのファイルと INDEX の処理は続け、失敗したファイルは指摘する

### 知らせ方

| 何を | どこへ | 理由 |
|---|---|---|
| 直したこと (欄の名前だけ、archive への移動先) と、場所ごとに 1 回の `INDEX.md を更新した (issue の変更と同じ commit に入れる)` | 契機になった tool の結果の `context` | その tool の直後に agent が読む。直したことは agent の判断を要さないので 1 行で足りる。INDEX の行は、パスを絞って commit するセッションが INDEX を取りこぼさないため |
| 指摘 (ファイル、何がおかしいか、何をすればよいか) | `$.session.append` で tool を実行した agent の会話 (subagent ならその `agentId`、届けられなければ main) | 指摘は agent に直させるもの。書いた agent に届けないと直されない |
| 起動時のまとめ | 最初の prompt の `context` | 起動時の修復はどの tool にも結び付かない。最初の request に 1 回だけ載せる。上の hook が prompt を drop した時は次の prompt まで持ち越す |

- ファイルは作業ディレクトリのものを `docs/issue/<ファイル名>`、他の場所を絶対パスで呼ぶ。ファイルから取った値や名前は引用符で括り 40 文字で切る (中身が agent への指示として読まれないように)
- 同じファイルの同じ指摘は、そのファイルの内容 (hash) が変わるまで繰り返さない。どの会話にも届かなかった指摘と、起動時のまとめの列挙 (全体で 5 件まで) に載らなかった指摘は「伝えた」ことにせず、後でもう一度送る

### close と archive

`status` が `resolved` か `discarded` で、指摘が 1 つも無いファイルを `archive/` へ移す。移す直前に読み直し、判定した時の内容と同じ時だけ移す。`archive/` は 1 段深いので、移した行には本文の相対リンク (`](../`) の数と、`../` を `../../` に直す必要があることを添える (本文は書き換えない)。`$.fs` は書けるが改名・削除ができないので、移動は `$.process.run` で `mkdir -p` と `mv -n` を行い、移ったかはファイルシステムを読み直して確かめる。移せなかった時は分かる範囲の原因 (mv のエラー文など) を添えて指摘する。`archive/` に同じ名前があれば移さずに指摘する。

開き直す時は、`archive/` の中で `status` を書き換えてから `docs/issue/` へ戻す。close の status のまま戻すと、次の検査でまた `archive/` へ移る。

### INDEX.md

active な全ファイルの frontmatter から毎回全体を生成し、文面が変わる時だけ書く。列は `| date | category | status | issue | title | blocked_by |`。`issue` は slug へのリンクにする (他の issue・DR・commit から issue を指す名前が slug なので、一覧からそのまま拾えるように)。`title` は一覧で issue を見分ける唯一の説明なので切らない。指摘が残っているファイルも載せ、不正な値はそのまま表示する (セルの中の改行は空白にする)。並びは status (`idea` → `open` → `wip` → `blocked`、続いて指摘で留まっている `resolved` / `discarded` とその他の値)、日付の新しい順、slug の順。

## 帰結

- issue 1 件の操作にかかる追加の費用は、一覧の取り直しと変わったファイルの読み直し (数十 ms) と、直した時の 1 行
- plugin の無いセッションや他の道具が書いた分は、次にそのリポで plugin のあるセッションが起動するまで揃わない。揃えた差分は、そのセッションの作業コピーに未 commit で現れる
- 起動時に揃える対象は、そのリポの active な全ファイル。別の形式の frontmatter で書かれてきたリポでは、最初の起動で全ファイルと INDEX が書き換わる。表に無い欄は、値が空か日時だけなら消え、それ以外の値があれば残して指摘する (理由を書いた欄が黙って消えると、その issue の判断の根拠が失われるため)
- close するとファイルのパスが変わる
- status が変わった時刻は記録しない。放置の目安は起票日だけ
- 修復は tool の呼び出しが返る時に走るので、issue を書き換えたのと同じ Bash の呼び出しの中で commit すると、commit が修復より先になり、`INDEX.md` (と直した frontmatter) が未 commit の差分として残る。issue を書き換える呼び出しが返ってから commit する
- push の前に呼べる検査 (Claude の外で動く CLI) は持たない

## 限界

- **同時の書き込み**: mod が読み直してから書くまでの間に別の書き手が同じファイルを書くと、その分を上書きする。mod の API に排他も原子的な置き換えも無いため
- **Bash のコマンドからの場所の読み取り**: コマンドの文字列に現れた `docs/issue/` を、セッションの作業ディレクトリを基準に読むだけ。`cd` の先、変数、空白入りのパスは追わない。取りこぼした他リポへの書き込みは、そのリポで次に起動したセッションが揃える。Write / Edit の絶対パスは確実に拾う
- **size も mtime も変わらない書き換え**: 検出しない
- **並んで走る tool**: 検査は先に終わった tool の後で走るので、直したことと指摘が、書いた agent でなくその tool の agent に届くことがある
- **`/clear` と compact の後**: 伝えた指摘は、ファイルが変わるまで出直さない。`/clear` とセッション内の `/resume` では `session.start` が起きないので、起動時のまとめも出直さず、監視している場所もそのまま続く

## しきい値

起動時の件数の知らせのしきい値は既定 5 で、環境変数 `CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD` で変えられる。既定値を運用から見直す時のために DR-0004 を予約している。
