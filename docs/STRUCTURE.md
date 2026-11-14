# STRUCTURE

```
README{,-ja}.md            最初の窓口 (英訳必須)
LICENSE                    MIT
CHANGELOG.md               版ごとの変更
justfile                   task runner (canonical: kawaz/bump-semver に準拠)
package.json               検査用の devDependencies (TypeScript / oxlint / bun の型)。配布物には関係しない
bun.lock                   package.json の依存の版の固定
tsconfig.json              hooks/ と tests/ の型検査 (engine の型定義だけを読む)
.oxlintrc.json             `as` (as const を除く) / any / 非 null の主張を禁じる lint
.gitignore                 .claude-plugin/types/、node_modules/ 等を git 管理外にする
.claude-plugin/
  plugin.json              plugin 宣言 (name: local-issue。リポ名 claude-local-issue から claude- を落とす)。engines に動作を確かめた Claude Code の版の範囲
  marketplace.json         marketplace 宣言
  types/                   engine が書き出す hooks module の型定義 (git 管理外)
hooks/
  hooks.json               hooks module を名指す ({ "modules": ["./register.ts"] })
  register.ts              $ を通す部分: session.start / tool.call / prompt.submit の hook、他リポの実行前の記録、読み書き、archive への移動、知らせ
  issue.ts                 判断の部分 (純粋な関数): frontmatter の正規化、INDEX の文面、一覧の差分、監視に足す引数と書く条件、知らせの文面
test/
  issue.spec.ts            hooks/issue.ts の単体テスト (bun test)
  tsconfig.json            test/ の型検査 (engine の型に bun の型を足す)
tests/
  register.test.ts         hooks/register.ts を engine の $ と代役の世界 (メモリ上のファイルシステム等) で駆動するテスト (claude plugin test)
docs/
  DESIGN{,-ja}.md          目的・ドメイン・アーキテクチャ・帰結・限界
  STRUCTURE.md             この file
  QUESTIONS.md             裁定待ちの問い
  decisions/
    DR-NNNN-<slug>.md      現役の設計判断
    INDEX.md               現役の DR の一覧と、archive/INDEX.md への 1 行のリンク
    archive/               置き換えられた DR と、その一覧 (INDEX.md)
  findings/
    YYYY-MM-DD-<slug>.md   検証結果・観察記録
  journal/
    YYYY-MM-DD-<slug>.md   作業の記録
  issue/
    YYYY-MM-DD-<slug>.md   active な issue
    archive/               close した issue
    INDEX.md               active な issue の一覧 (plugin が生成する)
```

テストの置き場を 2 つに分けている理由: `claude plugin test` は plugin の `*.test.ts` を engine の環境で読み込み、そこでは `bun:test` を import できない。`claude plugin validate` も `tests/` を engine の型だけで検査する。bun test で回す純粋な関数のテストは `test/*.spec.ts` に置き、どちらにも読まれないようにしている。
