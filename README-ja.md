# claude-local-issue

> [English](./README.md) | 日本語

agent が issue ファイルを直接読み書きする間、リポの `docs/issue/` の形を揃えておく Claude Code plugin。中身は Claude Mods の hooks module 1 つで、tool の実行後ごとに (main のセッションのものも、各 subagent のものも) `docs/issue/` を見て、変わったファイルの frontmatter を正規化し、`INDEX.md` を作り直し、close した issue を `docs/issue/archive/` へ移す。

セッションに command・skill・tool を足さず、issue の本文を書き換えず、commit もしない。いつ commit するかは作業しているセッションが決める。

## 導入

```bash
/plugin marketplace add kawaz/claude-local-issue
/plugin install local-issue@local-issue
/reload-plugins
```

Claude Code 2.1.325 以降が要る。動くのは `docs/issue/` ディレクトリが既にあるリポだけ (ディレクトリを作ることはしない)。

## 動き方

issue はいつもの tool (Write / Edit / Bash) で書く。たとえば見出しだけの新しいファイル:

```markdown
# Login fails on Safari

Steps to reproduce: ...
```

は、Write の直後に plugin が次の形にしている:

```markdown
---
title: Login fails on Safari
status: open
created: 2026-11-14
---
# Login fails on Safari

Steps to reproduce: ...
```

agent には、その tool の結果に付く行で次のように伝わる:

```
local-issue: docs/issue/2026-11-14-login-fails.md: frontmatter を足した、title を補った、status を補った、created を補った
local-issue: docs/issue: INDEX.md を更新した (issue の変更と同じ commit に入れる)
```

plugin だけでは決められないもの (この例では `category`) は、そのファイルを書いた tool の主である agent に、何をすればよいかと一緒に指摘として届き、agent が直す。

## ファイル

| パス | 置くもの |
|---|---|
| `docs/issue/YYYY-MM-DD-<slug>.md` | active な issue (`<slug>` は `[a-z0-9][a-z0-9-]*`、日付は暦にある日) |
| `docs/issue/archive/` | close した issue (同じファイル名) |
| `docs/issue/INDEX.md` | active な issue の frontmatter から生成する。手で編集しない |

`INDEX.md` と、名前が `README` で始まるファイルは (大文字小文字を問わず) issue として扱わない。`archive/` の中は読まず、書き換えない。

## frontmatter

欄はこの順。表に無い欄は、値が空か日時だけなら消す。それ以外の値が入っている欄は、書いた理由が失われないよう消さずに (表の欄の後ろに) 書かれたまま残して指摘する。値を本文へ移してから欄を消す。値が空の任意欄は書かない。

| 欄 | 必須 | 値 | 無い・不正な時 |
|---|---|---|---|
| `title` | 必須 | 1 行の文字列 | 本文の最初の `# ` 見出し (コードフェンスの外) から補う。見出しも無ければ指摘 |
| `status` | 必須 | `idea` / `open` / `wip` / `blocked` / `resolved` / `discarded` | 無ければ `open`。大文字と前後の空白は直す。`pending-sublimation` は `open` として読む値。それ以外は指摘 |
| `category` | 必須 | `idea` / `bug` / `request` / `design` / `task` / `tech-memo` | 指摘 (既定値を持たない)。大文字と前後の空白は直す |
| `created` | 必須 | 暦にある ISO 8601 の日付か日時 | ファイル名の日付で補う |
| `origin` | 任意 | 依頼元のプロジェクト | 書かれたまま |
| `blocked_by` | `status: blocked` の時 | 日本語 30 文字相当までの理由 (`docs/QUESTIONS.md` の裁定待ちはそのラベルを先頭に書く) か、待っている issue の slug | 無い・長い時は指摘。他の status では消す |
| `close_reason` | `resolved` / `discarded` の時 | `implemented` / `documented` / `discarded` / `duplicate` | 無い・不正な時は指摘。他の status では消す |
| `close_ref` | 任意 | 日本語 30 文字相当まで。close の根拠の参照 (DR 番号、版、finding の slug) | 長い時は指摘。close する status 以外では消す |

frontmatter の読み方:

- `欄: 値` を 1 行ずつ読む。値の引用符は外し、引用符の外の ` #` 以降はコメントとして読まない (`status: open # memo` は `open`)。コメントだけの行と空行は書き戻す時に消える
- 欄の名前は小文字として読む (`Title:` は `title:` で書き戻す)。同じ欄が 2 つになれば最初のものを残す。空白の無い `欄:値` を欄として読むのは上の 8 つの名前の時だけで、URL のような行を欄と取り違えない
- 値が複数行にわたる欄は、どの欄でも値ごと残して指摘する
- `blocked_by` と `close_ref` の上限は日本語で 30 文字程度。ASCII の文字 (コードポイントが 0x80 未満) を 1 文字 0.5、それ以外を 1 と数え、合計が 30 を超えたら指摘する。英数字だけの slug なら 60 文字まで入る
- `blocked_by` / `close_ref` を要素 1 つの配列 (`[値]`、中に `,` が無い) で書いた時は、括弧を外して書き戻す。要素が 2 つ以上の配列はそのまま 1 つの値として扱う
- `status` が不正な間は、status を直す途中で理由が失われないよう `blocked_by` / `close_reason` / `close_ref` を消さない
- 先頭の BOM は残し、その後ろを frontmatter として読む

次のファイルは、直されるまで 1 byte も変えずに指摘だけする: 終わりの `---` 行が無い frontmatter、conflict の印 (`<<<<<<<` `=======` `>>>>>>>` `%%%%%%%` `+++++++` `-------` で始まる行) を含む frontmatter、最初の `---` の前に空行や他の行がある frontmatter。

plugin が補う値はファイル自身 (名前、見出し) から決まり、時計は使わない。同じファイルからは誰が何回やっても同じ結果になる。ファイル名が `YYYY-MM-DD-<slug>.md` の形でなければ指摘する (plugin は改名しない)。

## close と開き直し

`status` を `resolved` か `discarded` にして `close_reason` を書く。そのファイルへの指摘が無くなった時点で、plugin が `docs/issue/archive/` へ移し、移動先のパスを agent に知らせる。`archive/` は 1 段深いので、本文に相対リンク (`](../`) があれば、その数と、`../` を `../../` に直す必要があることも添える (本文は書き換えない)。移す直前にファイルを読み直し、判定した時の内容と同じ時だけ移す。指摘が残っている間は移さず、`archive/` に同じ名前のファイルがあれば、移さずに指摘する。

close した issue を開き直す時は、`archive/` の中で `status` を書き換えてから `docs/issue/` へ戻す。close の status のまま戻すと、次の検査でまた `archive/` へ移る。

## INDEX.md

`docs/issue/` の何かが変わるたびに active な issue 全部から作り直し、文面が変わる時だけ書く。列は `| date | category | status | issue | title | blocked_by |`。`date` はファイル名の日付、`issue` は slug へのリンク (他の issue・DR・commit から issue を指す名前。ファイル名に slug が無い時はファイル名)、`title` は題の全文 (改行は空白にする)。並びは status (`idea` → `open` → `wip` → `blocked`、その後に指摘が残って active に留まっているもの)、同じ status の中は日付の新しい順、同じ日付は slug の順。

## agent への知らせ

ファイルは、作業ディレクトリのものを `docs/issue/<ファイル名>`、他の場所のものを絶対パスで呼ぶ。ファイルから取った値や名前は引用符で括り 40 文字で切る (ファイルの中身が agent への指示として読まれないように)。

- **直したこと**: 契機になった tool の結果に、ファイルごとに直した欄の名前だけを 1 行で付ける (`local-issue: docs/issue/<file>: status を直した、foo を消した`)。`archive/` へ移した時は移動先を書く。`INDEX.md` を書き換えた時は、場所ごとに `INDEX.md を更新した (issue の変更と同じ commit に入れる)` を 1 回だけ添える (パスを絞って commit するセッションが INDEX を取りこぼさないため)
- **指摘**: tool を実行した agent の会話に足す (subagent ならその subagent に。届けられなければ main に)。ファイルごとに 1 行で、何がおかしいかと何をすればよいかを書く。同じファイルの同じ指摘は、ファイルの内容が変わるまで繰り返さない。どの会話にも届かなかった指摘は、次の検査でもう一度送る
- **起動時**: 下の節
- 読み書きに失敗したファイルは指摘し、他のファイルと `INDEX.md` の処理は続ける

## commit

plugin は commit しない。commit する時は:

- issue を書き換える tool の呼び出しが返ってから commit する。plugin はその呼び出しが返る時に `docs/issue/` を揃えるので、同じ Bash の呼び出しの中で issue を書き換えて commit すると、commit の後に `INDEX.md` (と直した frontmatter) が書き換わり、未 commit の差分として残る
- パスを絞って commit する時は、plugin の行に出たファイルを含め、`INDEX.md を更新した` が出ていれば `INDEX.md` も含める
- 起動時に揃えた分は未 commit なので、他の変更と分けて commit する

## 起動時

`docs/issue/` のあるリポでセッションが起動すると、そこの active な issue 全部を一度正規化し、最初の prompt に 1 回だけまとめを足す。直したこと、残っている指摘、`INDEX.md` を書き換えたか、active な issue の件数がしきい値以上ならその件数と古い順 3 件。ファイルの列挙は全体で 5 件まで (指摘を先に) で、残りは件数で書く。列挙に載らなかった指摘は、後でもう一度伝える。

これで、plugin の無いセッションや他の道具が書いた分を揃える。別の形式の frontmatter で書かれてきたリポでは、最初の起動で active な全ファイルと `INDEX.md` が書き換わる。上の表に無い欄は、値が空か日時だけなら消え、それ以外の値があれば残して指摘する。揃えた差分は作業コピーに未 commit で残る。

## 他のリポ

書き込みうる tool の呼び出し (Write / Edit の `file_path`、Bash のコマンド中のパス) が別のリポの `docs/issue/` を名指したら、その場所も監視に加える。そこでは、このセッションの tool が変えたものだけを扱う。tool を実行する前にディレクトリの状態を記録し、実行後はその記録と違うファイルだけを正規化 (と close) して、何か変わった時だけそのリポの `INDEX.md` を作る。他リポの issue を読んだだけ・名前が出ただけで何も変えていなければ、そのリポには何も書かない。そのリポの `docs/issue/` 全体を揃えるのは、そのリポで起動したセッションの仕事。

## 限界

- **同時の書き込み**: plugin が読み直してから書くまでの間に別の書き手が同じファイルを書くと、その分を上書きする。hooks の API に排他も原子的な置き換えも無いため
- **Bash のコマンド中のパス**: `docs/issue/` はコマンドの文字列からだけ、セッションの作業ディレクトリを基準に読む。コマンドの中の `cd`、変数、空白入りのパスは追わない。こうして取りこぼした他リポへの書き込みは、そのリポで次に起動したセッションが揃える。Write / Edit の絶対パスは確実に拾う
- **size も mtime も変わらない書き換え**は検出しない
- **並んで走る tool**: 検査は先に終わった tool の後で走るので、直したことと指摘が、書いた agent でなくその tool の agent に届くことがある
- **`/clear` と compact の後**: 伝えた指摘は、ファイルが変わるまで出直さない

## 設定

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `CLAUDE_LOCAL_ISSUE_COUNT_THRESHOLD` | `5` | 起動時のまとめで件数と古い順 3 件を出し始める active な issue の数 |

## 開発

```bash
bun install      # 検査に使う TypeScript・oxlint・bun の型
just ci          # validate、型検査、lint、テスト、翻訳の鮮度
```

`test/` は判断の部分 (純粋な関数) の単体テスト (`bun test`)、`tests/` は hooks module を engine とメモリ上のファイルシステムで駆動するテスト (`claude plugin test`)。hooks module の型定義 (`.claude-plugin/types/`) は、Claude Code が対話 session でこのフォルダから plugin を読み込んだ時 (`claude --plugin-dir .`) か、`/plugin-types .` で書き出される。

## ライセンス

MIT
