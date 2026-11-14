# DR-0006: issue は直接編集し、mod が frontmatter と INDEX を揃える

- Status: Accepted
- Date: 2026-11-14

## Context

目的は、kawaz のリポ群で `docs/issue/` の INDEX と status 管理の型を揃えること。issue ファイルの直接編集を禁じることは目的ではない。

増やしたくないもの:

- LLM が実行する散文の手順書 (決定的にできる処理を model に実行させる経路)
- issue の状態を持つ場所 (frontmatter 以外に持たない。INDEX は frontmatter から導く生成物)
- plugin が作る commit (いつ commit するかは作業しているセッションが決める)
- 常時 context に載る説明 (tool の description、skill の一覧)

根拠は `docs/findings/2026-11-14-user-interviews-for-redesign.md` (利用側 3 プロジェクトの回答) と、同日の PoC の実測 (下の「実測した前提」)。

## Decision

### 1. 構成

plugin は mod (function hooks) 1 つだけを持つ。commands、classic hook、skill、templates は持たない。tool も登録しない。

- agent は issue ファイルを Read / Write / Edit / Bash で直接読み書きする
- mod は tool の実行後ごとに `docs/issue/` の変化を検出し、frontmatter の正規化、INDEX の再生成、close したファイルの archive への移動を行う
- 本文 (frontmatter より後ろ) は mod が一切書き換えない
- mod は commit しない

### 2. ファイルの置き場

- active: `docs/issue/YYYY-MM-DD-<slug>.md` (`<slug>` は `[a-z0-9][a-z0-9-]*`)
- close 済み: `docs/issue/archive/` (同じファイル名)
- 索引: `docs/issue/INDEX.md` (mod が生成する。手で編集しない)

mod が扱うのは `docs/issue/` 直下の `.md` (INDEX.md と README で始まるものを除く)。`archive/` の中は読まず、書き換えない。

### 3. frontmatter

欄はこの順で書く。これ以外の欄は、値が空か日時だけなら mod が消す。それ以外の値が入っている欄は消さずに指摘する (値を本文へ移してから欄を消すよう促す。理由を書いた欄が黙って消えると、その issue の判断の根拠が失われるため)。値が空の任意欄は書かない。

| 欄 | 必須 | 値 | 無い・不正な時 |
|---|---|---|---|
| `title` | 必須 | 1 行の文字列 | 本文の最初の `# ` 見出しから補う。見出しも無ければ指摘 |
| `status` | 必須 | `idea` / `open` / `wip` / `blocked` / `resolved` / `discarded` | 無ければ `open`。大文字と前後の空白は直す。`pending-sublimation` は `open` に読み替える。それ以外は指摘 |
| `category` | 必須 | `idea` / `bug` / `request` / `design` / `task` / `tech-memo` | 指摘 (既定値を持たない。大文字と前後の空白は直す) |
| `created` | 必須 | ISO8601 の日付か日時 | ファイル名の日付で補う |
| `origin` | 任意 | 依頼元のプロジェクト名 | そのまま |
| `blocked_by` | `status: blocked` の時は必須 | 30 文字以内。裁定待ちは `docs/QUESTIONS.md` のラベルを先頭に書く。他の issue を待つ時はその slug を書く | `blocked` で無ければ指摘。30 文字を超えたら指摘。`blocked` 以外の status では消す |
| `close_reason` | `resolved` / `discarded` の時は必須 | `implemented` / `documented` / `discarded` / `duplicate` | close する status で無い・不正なら指摘。それ以外の status では消す |
| `close_ref` | 任意 | 30 文字以内。根拠の参照 (DR 番号、版、finding の slug) | 30 文字を超えたら指摘。close する status 以外では消す |

- frontmatter が無いファイルには mod が足す
- 欄の名前の大文字は小文字に直す (`Title:` は `title:` として読む)。同じ欄が 2 つあれば最初のものを残して消す
- frontmatter は `欄: 値` を 1 行ずつ並べたものとして読む。値は 1 行の文字列で、引用符は外し、引用符の外の ` #` 以降はコメントとして読まない。コメントだけの行と空行は書き戻す時に消える。`欄:値` (空白なし) は、上の表の欄の名前の時だけ欄として読む
- 値が複数行の欄は、どの欄でも値ごと残して指摘する
- 次のファイルには触れずに指摘する: frontmatter が閉じていない、frontmatter の中に conflict の印 (`<<<<<<<` `=======` `>>>>>>>` `%%%%%%%` `+++++++` `-------` で始まる行) がある、frontmatter の `---` の前に空行や他の行がある
- 先頭の BOM は保ったまま、その後ろを frontmatter として読む
- 日付 (ファイル名、`created`) は暦として正しいものだけを受け入れる
- 30 文字の上限は日本語で 30 文字程度という意味で、ASCII の文字は 1 文字を 0.5 と数える (英数字だけの slug なら 60 文字まで入る)
- `blocked_by` と `close_ref` の値が `[値]` の形 (要素が 1 つの配列) なら、括弧を外して直す
- `status` が不正な間は、`blocked_by` / `close_reason` / `close_ref` を消さない (status を直す途中で理由が失われないように)
- ファイル名が置き場の形に合わないものは指摘する (mod は改名しない)
- 「直す」「補う」「消す」は mod がコードで行い、「指摘」は agent に直させる
- 補う値は入力だけから決まるものに限る (現在時刻を使わない)。同じ入力からは誰が何回やっても同じ結果になる

### 4. close

`status` が `resolved` か `discarded` で、指摘が 1 つも無いファイルを、mod が `archive/` へ移す。指摘が残っている間は移さない。移した先のパスを知らせる。本文に `../` で始まる相対リンクがあれば、その数と、1 段深くなったので直す必要があることも添える (本文は mod が書き換えない)。`archive/` に同じ名前のファイルがあれば、移さずに指摘する。移す直前にファイルを読み直し、判定した時の内容と同じ時だけ移す。

close した issue を開き直す時は、`archive/` の中で `status` を書き換えてから `docs/issue/` へ戻す (close の status のまま戻すと、次の検査でまた `archive/` へ移る)。

### 5. INDEX.md

active の全ファイルの frontmatter から毎回全体を生成し、内容が変わる時だけ書く。

- 列: `| date | category | status | issue | title | blocked_by |`。`issue` は `[<slug>](./<ファイル名>)` (他の issue・DR・commit から issue を指す時の名前が slug なので、一覧からそのまま拾えるようにする)。`title` は長くても切らない (一覧で issue を見分ける唯一の説明なので)。`date` はファイル名の日付
- 並び: status の順 (`idea` → `open` → `wip` → `blocked`)、同じ status の中は日付の新しい順、同じ日付は slug の順
- 指摘が残っているファイルも載せる (不正な値はそのまま表示する)
- 冒頭に「自動生成。手で編集しない」旨を本文として 1 行書く

`docs/issue/` が無いリポでは mod は何もしない (ディレクトリを作らない)。

### 6. 検出

- 監視する場所: セッションの cwd の `docs/issue/`。加えて、書き込みうる tool の引数 (Write / Edit の `file_path`、Bash の `command`) に `docs/issue/` を含むパスが現れたら、そのディレクトリを監視に足す (他プロジェクトへの起票)
- cwd の `docs/issue/` は、`session.start` で全ファイルに 3〜5 を一度通す (plugin の無いセッションや他の道具が書いた分をここで揃える)
- cwd 以外の `docs/issue/` では、このセッションの tool が変えたファイルだけに 3〜4 を通し、5 を行う。足す時は、その tool を実行する前の状態を記録するだけで、ファイルも INDEX も書き換えない (読んだだけ・名前が出ただけの他リポを書き換えないため。他リポの全体を揃えるのは、そのリポで起動したセッションの仕事)
- `tool.call` で `await next(e)` の後、一覧 (名前・size・mtime) を取り直し、変わったファイルだけ読んで hash を比べる。変化があれば 3〜5 を通す。main と subagent の両方の tool が対象
- 修復は tool の結果を返す前に同期で行う。並んだ tool の検査は直列にする
- 書き戻す直前に読み直し、検出時から変わっていたらやり直す

### 7. 知らせ方

- **直したこと**: その tool の結果に付く context に、ファイルごとに直した欄の名前だけを 1 行で書く (例: `local-issue: docs/issue/2026-11-14-foo.md: status を直した、foo を消した`)。archive へ移した時は移動先を書く。INDEX.md を書き換えた時は、その場所ごとに `INDEX.md を更新した (issue の変更と同じ commit に入れる)` を 1 回だけ添える (パスを絞って commit するセッションが INDEX を取りこぼさないため)。それ以外に INDEX の中身は知らせない
- **指摘**: `$.session.append` で、ファイル名・欄・許される値を 1〜2 行で書く。検査を走らせた tool が subagent のものならその subagent に (`agentId`)、それ以外は main に送る。subagent に届けられなかった時は main に送る。同じファイルの同じ指摘は、そのファイルの内容が変わるまで繰り返さない。届けられなかった指摘は「伝えた」ことにせず、次の検査でもう一度送る
- **起動時**: `session.start` で直したこと・残っている指摘と、active の件数がしきい値 (`CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD`、既定 5) 以上の時の件数と古い順 3 件を、最初の prompt の時に 1 回だけまとめて足す。ファイルの列挙は全体で 5 件までで、残りは件数で書く。列挙に載らなかった指摘は「伝えた」ことにしない
- ファイルの呼び方は、cwd のものは `docs/issue/<ファイル名>`、他の場所は絶対パスに揃える
- ファイルに書かれていた値やファイル名を文に入れる時は、引用符で括り 40 文字で切る (ファイルの中身が agent への指示として読まれないように)
- 1 つのファイルの読み書きに失敗しても、残りのファイルと INDEX の処理は続ける。失敗したファイルは指摘する

## 実測した前提 (Claude Code 2.1.325、2026-11-14)

- `tool.call` の after で Write / Edit / Bash (`printf >`、`mv`、`rm`) の変化をすべて検出できた。subagent の tool も同じ hook に `agentId` 付きで届く
- 1 回の検査は、一覧だけなら 200 ファイルで 3〜4 ms、全ファイルを読んで hash を取っても 20〜28 ms
- 同期で直すと、engine が変化に気づいて agent の既読状態を更新するので、続く Edit は失敗しない。結果を返した後に直すと、Write での上書きが「読んだ後に変更された」で失敗し、`-p` では修復が走らないか指摘が届かない場合がある
- `$.session.append` の指摘は、main でも subagent でも同じ turn の次の step に載り、agent は従って直した
- `/clear` と session 内の `/resume` では `session.start` が起きず、mod の一覧は残る。別のリポのファイルは cwd の監視では検出されない

## Alternatives Considered

### A. schema 付きの MCP tool で起票・status 変更・close を行う

利用側 2 プロジェクトが推した形。型は確実に揃うが、tool の description が常時 context に載り、本文の追記は結局 Edit で行うので経路が 2 つになる。Bash や plugin の無いセッションが書いた分は別に検査が要る。hash による検出で直接編集の取りこぼしが無くなるので、tool を持つ理由が残らない。

### B. 直接の Write / Edit を hook で止め、CLI を通させる

直接編集を禁じることは目的でない。本文を育てる編集は直接行うのが利用側の実態。

### C. 修復を tool の結果を返した後に非同期で行う

tool の応答を待たせない利点はあるが、検査は数十 ms で済む。非同期では上の実測のとおり、上書きの失敗と `-p` での取りこぼしが起きる。

### D. category や close の要否を model (subagent、Jev) に判定させる

利用側は category で迷っていない。呼び出すたびに結果が変わることが不具合の元だった。判定は書く側が行い、mod は enum の検査だけをする。

## Consequences

- issue 1 件の操作にかかる追加の費用は、検査の数十 ms と、直した時の 1 行だけになる
- plugin の無いセッションや他の道具が書いた分は、次にそのリポで mod のあるセッションが起動するまで揃わない。揃えた差分は、そのセッションの作業コピーに未 commit で現れる
- close するとファイルのパスが変わる
- status が変わった時刻は記録しない。放置の目安は起票日だけになる
- push の前に呼べる検査 (Claude の外で動く CLI) は持たない
- 起動時に揃える対象は、そのリポの active の全ファイル。これまでの形式で書かれたリポでは、最初の起動で全ファイルと INDEX が書き換わる。表に無い欄は値があっても消える (値は VCS の差分に残る)

## 限界

- **同時の書き込み**: mod が読み直してから書くまでの間に、別の書き手が同じファイルを書くと、その分を上書きする。mod の API に排他も原子的な置き換えも無いため
- **Bash のコマンドからの場所の読み取り**: コマンドの文字列に現れた `docs/issue/` を、セッションの cwd を基準に読むだけ。`cd` の先、変数、空白入りのパスは追わない。取りこぼした他リポへの書き込みは、そのリポで次に起動したセッションが揃える。Write / Edit の絶対パスは確実に拾う
- **size も mtime も変わらない書き換え**: 検出しない
- **並んで走る tool**: 検査は先に終わった tool の後で走るので、直したことと指摘が、書いた agent でなくその tool の agent に届くことがある
- **`/clear` と compact の後**: 伝えた指摘は、ファイルが変わるまで出直さない
