---
description: issue 1 件を読んで last_read を記録し、呼び出し側 TODO に「次方針を update で反映するまで」を積ませる (read しっぱなし放置防止)。AI が特定 issue を読んで対応検討する時に呼ぶ。詳細仕様は /local-issue:local-issue を参照。
argument-hint: '<slug or file> [--repo <name|path>]'
model: haiku
context: fork
agent: general-purpose
allowed-tools: Read, Edit, Bash(ls:*), Bash(cat:*), Bash(date:*), Bash(git rev-parse:*), Bash(bump-semver:*)
---

# read — ローカル issue を 1 件読む

渡された 1 件を読んで返し、`last_read` を記録する。**他 issue / INDEX.md / archive は触らない。** 読みっぱなしの放置を防ぐため、次の方針を呼び出し側 TODO に積ませる。

## 入力 ($ARGUMENTS)

- `$0`: slug または file path (必須)
  - slug の例: `initial-open-items`
  - file path の例: `docs/issue/2026-06-18-initial-open-items.md` / 絶対パス
- `--repo <name|path>` (任意): 対象リポ。リポ名なら `~/.local/share/repos/github.com/kawaz/<name>/main` 規約。省略時は `$CLAUDE_PROJECT_DIR`

`$0` が空なら「slug or file が必要」を報告して終了。

## 固定フロー (順に実行、逸脱しない)

1. **対象 root を確定**
   - `--repo` があれば解決、無ければ `$CLAUDE_PROJECT_DIR`
   - `cd <root> && git rev-parse --show-toplevel` で正規化

2. **対象 file を特定**
   - `$0` が `.md` で終わる path (相対 or 絶対) ならそれを採用 (存在確認)
   - `$0` が slug ならまず `<root>/docs/issue/*-<slug>.md` を glob、複数該当時は日付降順で最新を採用
   - active で見つからなければ `<root>/docs/issue/archive/*-<slug>.md` を探す (= archive の参照は許可、ただし step 4 の last_read 更新と step 5 の commit は active 配下のみで実施。archive を読んだ時は last_read 更新と commit をスキップして報告のみ)
   - それでも見つからなければ「<root>/docs/issue/ に <slug> 該当なし」を報告して終了

3. **Read**: frontmatter + 本文全文

4. **last_read を更新** (archive を読んだ場合はスキップ)
   - `date -Iseconds` で現在時刻 (full ISO8601 + TZ、例 `2026-06-19T16:30:00+09:00`) を取得
   - 該当 file の frontmatter `last_read:` を Edit で上書き (空でも上書き)
   - INDEX.md は触らない (last_read は INDEX 列に出ない)

5. **path 限定 commit** (archive を読んだ場合はスキップ)
   - `cd <root> && bump-semver vcs commit -m "issue(read): <slug> last_read" docs/issue/<file>`
   - 冪等 (内容変化なしなら no-op)

6. **報告**

## やらないこと

- `status` / `category` / 本文を変えない (= `update` の責務)
- INDEX.md を触らない
- archive 移動 / 後続起票しない
- push しない
- 他 issue を読む / 走査しない (= 1 件スコープ)

## 報告フォーマット

### active を読んだ場合 (= デフォルト)

```
<root>/docs/issue/<file> を読了 (last_read=<ISO8601>)
status=<...>, category=<...>, blocked_by=<...>
直近 transition: <最も新しい *_entered>

---
<frontmatter + 本文 全文>
---

次の方針 TODO (呼び出し側で積むこと):
- [ ] update でステータス反映: <pending-sublimation / wip 開始 / blocked / discarded / resolved> を選んで実行
```

### archive を読んだ場合 (= 過去経緯参照)

```
<root>/docs/issue/archive/<file> を archive から読了 (last_read 更新なし、commit なし、TODO 化なし)
status=<resolved/discarded>, category=<...>, close_reason=<...>
最終 transition: <resolved_entered or discarded_entered>

---
<frontmatter + 本文 全文>
---
```

archive 経路では last_read 記録も commit も行わず、次方針 TODO も積まない (= 過去経緯の参照は read しっぱなしでよい)。

呼び出し側 (= 親セッション) は active の場合のみ TODO 行を必ず TODO list に追加すること (= read しっぱなしを防ぐ this skill の責務)。
