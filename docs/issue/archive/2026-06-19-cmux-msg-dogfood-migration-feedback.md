---
title: cmux-msg を先行ドッグフード migration した結果のフィードバック
status: resolved
category: tech-memo
created: 2026-06-19T11:00:00+09:00
last_read:
open_entered: 2026-06-19T11:00:00+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-06-20T00:04:24+09:00
discard_reason:
pending_reason:
close_reason: ["implemented:DR-0003(v0.2.0)","implemented:update-SKILL.md(v0.2.1-5ac4dbe)"]
blocked_by:
origin: kawaz/claude-cmux-msg からの依頼 (= 越境フィードバック)
---

# cmux-msg を先行ドッグフード migration した結果のフィードバック

## 概要

プラグイン未完成の段階で `kawaz/claude-cmux-msg` の `docs/issue/` を本プラグインの世界観 (DR-0001/DR-0002 + write/update SKILL.md 推奨 frontmatter) に **手動 migration** した結果を、設計検討の材料として共有する。実機 migration したことで仕様の曖昧点 / 解釈ブレ箇所が見えたので、本 issue で論点を列挙する。

## 一次資料 (commit id)

cmux-msg リポ (= kawaz/claude-cmux-msg):

- **before**: `954904715fb5` (= ci.yml pin 削除直後、migration 前の状態)
- **after**: `dd2487fed556` (= "chore(issue): claude-local-issue 世界観へ手動 migration")

確認:
```bash
cd ~/.local/share/repos/github.com/kawaz/claude-cmux-msg/main
jj diff -r 954904715fb5..dd2487fed556 docs/issue/
```

## migration の中身

- archive 移動 + frontmatter migration 6 件 (= status=discarded 5 + resolved 1)
  - 主に DR-0009/0010/0011 (cmux 全廃) で前提消失したもの、DR-0007 で前提解消したもの、commit f73b432 で実装済のもの
- active 維持 + frontmatter migration 4 件
  - status=idea / open のもの。INDEX.md にこの 4 件のみ列挙
- `docs/issue/INDEX.md` 新規 (cmux-msg リポにはこれまで INDEX が無かった)

## 仕様検討の論点 (= 検討してほしい)

実機 migration 中に「ここどう書くべき?」と判断に詰まった / ブレた箇所。プラグインで skill 化すれば AI 側の判断が要らなくなるはずなので、設計時の論点として共有する。

### 1. `discarded` vs `closed` (= status 統合)

現行 DR-0002 では `discarded` / `resolved` が独立 status。一方で、両者は「archive へ移動して close する」点で同じ挙動を取るため、「`closed` 1 つに統合し、reason 側で `discarded` / `implemented` を区別する」案もありうる (kawaz 提案)。

ただし kawaz の意図は「update skill が discarded 遷移時に行う一連の close 処理 (時刻記録 + reason 正規化 + archive 移動 + 要約) を `closed` として総称する」概念であり、status enum 自体を縮約する話ではない、と確認済。

→ 現行 DR-0002 維持で OK。ただし update skill の挙動説明に「discarded / resolved どちらも close 系処理を起動する」を明示しておくと AI 側の混乱が減る。

### 2. `discard_reason` の要約テキスト同居

現行 SKILL.md (update) では `close_reason` の要素として `done:顧客に報告済み` (= prefix + `:` + 自由補足) が許容されている。`discard_reason` も同形式と仮定して migration したが、ドキュメント上で `discard_reason` の prefix 仕様が明示されていない。

migration では最小限の `discard_reason: ["dr/DR-0009"]` のみ書いたが、本来は `["dr/DR-0009:cmux 廃止で前提消失"]` のように要約を入れた方が後から参照する価値が上がる。

→ skill 側で「discard_reason / close_reason は同じ string[] 形式、各要素は `<prefix>` or `<prefix>:<自由補足>`」を明文化したい。

### 3. 要約テキストはどこに入る?

「要約 = 自由文 1-2 行」を入れたい場合、選択肢:

- (a) `discard_reason` / `close_reason` の string 要素内に `:<補足>` で入れる (現行で表現可能)
- (b) frontmatter に別 field を追加 (e.g. `close_summary: "..."`)
- (c) 本文末尾に `## close 経緯` セクションを skill が追加する

migration では (a) も (b) もやらず、本文には旧 file の `## 解決時の記録先` セクション (= 元 issue 本文に書かれていた、起票時点の「将来解決時の記録先想定」) をそのまま残した。これは「過去の予測」なので close 後は無意味になる場合もある。

→ skill が close 時に本文セクションを書き換えるか、frontmatter 側に正規化するかの設計判断が要る。

### 4. archive 移動した issue の本文セクション処理

archive 行きの 6 件は、本文末尾に `## 解決時の記録先` セクションを持っていた。元の起票時点では「将来解決時に何をどこに残すか」の想定だったが、実際の close 時には skill が `close_reason` を生成するので **当該セクションは無意味**。

migration ではそのまま残したが、本来 update skill は close 時にこのセクションを削除する (or `## close` セクションに置換する) のが筋。

→ update skill の close フローに「本文末尾の `## 解決時の記録先` セクションがあれば削除 (or 置換)」を含める検討。

### 5. INDEX.md の新規導入

cmux-msg リポにはこれまで INDEX が存在しなかった (= 旧 docs-knowledge-flow rule では「5+ issue で任意導入」)。本プラグインでは INDEX 必須 (= write/update skill が触る)。

→ migration で INDEX 新設したが、書式 (= 列順序 / category 列の有無 / 「概要」列の文字数制限) は claude-local-issue リポの INDEX.md を踏襲した。プラグイン側で **正規フォーマットを INDEX 雛形として template embed しておく**と、INDEX 不在リポへの初回 migration が機械化できる。

### 6. 既存 file の本文行 `Status: open` / `Priority: Low` / `発見元: ...` の扱い

旧 issue の中には frontmatter ではなく本文行で `- Status: Open` / `- Date: ...` / `- Priority: Low (...)` / `- 発見元: ...` を書いていたものがあった。

migration では:
- `Status` / `Date` → frontmatter (`status` / `created`) に統合、本文行は削除
- `Priority` / `発見元` → frontmatter schema 外なので本文に残置

→ プラグインで「Priority field を frontmatter に入れるか」「発見元は origin field と統合するか」を決めれば、本文行残置の判断ブレが消える。

### 7. 「Will be sublimated after DR-... land」コメントの削除

旧 issue の status 行に「Will be sublimated after DR-0009/0010 land」と書かれているものがあった。migration では `no-historical-noise` rule に従って削除した (= 経緯は frontmatter の `discard_reason` 側に記録されるので不要)。

→ update skill が status 遷移時にこの種の旧コメント (frontmatter ではない本文行で status を記述しているパターン) を検出・削除する仕様にすると、過渡期の migration 漏れを救える。

## kawaz 観測の所感

各フィールドの役割解釈のブレが発生したこと自体が、プラグイン & skill 化の目的を裏付ける (= AI が毎回 frontmatter / reason / 本文の書き方を判断していると解釈差が積もる、skill が固定すれば消える)。

## 提案アクション

1. 上記論点をプラグイン本体の DR / SKILL.md にフィードバック (= 必要なら DR-0003 起票)
2. プラグイン完成後、cmux-msg リポを最初の正式ドッグフード対象とし、本 migration 結果と再 migration の差分を取って互換性を検証
3. 本 issue は「プラグイン完成 + 再 migration 完了」で `resolved` (= journal 退避 + archive 行き)

## close 経緯

7 論点全て plugin v0.2.0 / v0.2.1 で反映完了。次フェーズ (= cmux-msg を正式 dogfood migration、手動 migration vs migrate skill 駆動 migration の互換性 diff) は本 issue のスコープ外なので、別 issue として今後起票する。本 issue は resolved として archive 移動。
