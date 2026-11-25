# セキュリティ演習(security-labs)

**意図的に脆弱なコード**を使って、脆弱性を理解し、修正し、CodeQL などのツールが**何を検出し、何を検出しないか**を学ぶ演習です(課題11)。

> ⚠️ **安全のルール**
> - 脆弱なコードは `.txt` で保管され、`main` では実行・ビルド・解析の対象になりません([ADR-0013](../docs/adr/0013-security-labs-isolation.md))
> - 演習は自分の **`exercise/*` ブランチ**にだけ展開します。**`main` にマージしない**(CI の Exercise Guard が失敗します)
> - **ネットワークに公開しない**。テストの中(`app.inject()`)だけで動かす。実際のサービスへ攻撃を試さない
> - **実在の秘密・トークン・個人情報を使わない**(Secret Scanning の確認にも使わない)

## 演習一覧

| # | テーマ | CodeQL(実測) | 学ぶこと |
|---|---|---|---|
| [01](01-sql-injection/README.md) | SQLインジェクション | ✅ 検出(High) | バインド変数・許可リスト |
| [02](02-command-injection/README.md) | コマンドインジェクション | ✅ 検出(Critical) | シェルを介さない・引数配列 |
| [03](03-path-traversal/README.md) | パストラバーサル | ✅ 検出(High) | パスの解決・シンボリックリンク |
| [04](04-input-validation/README.md) | 入力値検証の不備(Mass Assignment) | ❌ **検出なし** | `as` は検証ではない・`strict` |
| [05](05-hardcoded-secret/README.md) | 秘密のハードコード | ❌ **検出なし** | 環境変数・起動時検証 |
| [06](06-error-disclosure/README.md) | エラー情報の過剰な公開 | ❌ **検出なし** | 利用者向け/内部向けの分離 |
| [07](07-broken-access-control/README.md) | 認可の欠如(IDOR) | ❌ **検出なし** | 認証と認可・サーバー側で権限を決める |
| [08](08-ssrf/README.md) | SSRF | ✅ 検出(Critical) | 許可リスト・リダイレクト |

## CodeQL の検出結果(実測)

**実施**: 2026-11-25。8演習の脆弱版を `lab-workspace/` に展開した使い捨ての `exercise/*` ブランチで PR を作り、このリポジトリの `.github/workflows/codeql.yml`(`languages: javascript-typescript`、`queries: security-extended`)を実行。PR と使い捨てブランチは確認後に削除した。

| 演習 | 検出されたルール | Severity |
|---|---|---|
| 01 SQLi | `js/sql-injection` | High |
| 02 コマンド | `js/command-line-injection` | **Critical** |
| 03 パス | `js/path-injection` | High |
| 08 SSRF | `js/request-forgery` | **Critical** |
| 04 入力検証 / 05 秘密 / 06 エラー情報 / 07 認可 | **なし** | — |
| 01・02・03・06 | `js/missing-rate-limiting`(おまけの指摘) | High |

### 読み取れること(考察)

- **検出できたもの**は、「外部入力(クエリ・ボディ)→ 危険な処理(SQL・コマンド・ファイル・HTTPリクエスト)」という**データの流れ**が追えるもの(**taint tracking**)。得意分野
- **検出できなかったもの**は、**仕様・設計・文脈**に依存する問題:
  - 04: 「どのフィールドを受け付けるべきか」は仕様。型アサーションは危険な関数への流れではない
  - 05: 「これは秘密か」は文脈。今回の書き方(HMACの鍵・文字列比較)は、ルールが対象にするAPIではなかった
  - 06: 同じ種類の問題を検出するクエリ(`js/stack-trace-exposure`)はあるが、今回の書き方(Fastifyの `reply.send`)では検出されなかった。**書き方・フレームワークで検出の有無が変わる**
  - 07: **認可(誰に何を許すか)は、SASTが最も苦手**。最も深刻な問題の1つが、ツールの出力に何も出ない
- **「ツールが静かだから安全」ではない**。検出できないものは、テスト(攻撃を試すテスト)・レビュー・設計(脅威モデリング)で守る
- `js/missing-rate-limiting`: 「重い処理(DB・ファイル・外部コマンド)を認証/レート制限なしで公開している」という指摘。このプロジェクトの本題(ローカル専用)では優先度が低く、**ツールの指摘を文脈で優先付けする**練習になる

> ⚠️ これは1回の実測。CodeQL はバージョンとクエリが更新されるので、結果は変わりうる。**自分のPRで必ず確かめる**こと。

## 進め方

```bash
npm run lab:start -- 01        # ブランチ exercise/sec-01-sql-injection を作り、lab-workspace/01-sql-injection/ に展開
npm run lab:test -- 01         # 失敗する(= 脆弱)ことを確認
#   → lab-workspace/01-sql-injection/app.ts を修正(security.test.ts は変更しない)
npm run lab:test -- 01         # 全部通る
git add lab-workspace && git commit -m "lab: 01 を修正" && git push -u origin HEAD
gh pr create --draft --fill    # ドラフトPR。CodeQL の結果を確認(Security → Code scanning、PRのチェック)
# 自分の修正前/後でアラートがどう変わるかを見る → PRを閉じ、ブランチを削除
git switch main && git branch -D exercise/sec-01-sql-injection && git push origin --delete exercise/sec-01-sql-injection
```

> 注意: 脆弱なコードを push すると、公開リポジトリにそのコードが載ります(演習用のダミーです)。**自分のコピー(fork)で**行ってください。

### 各テーマの README の構成

1. 脆弱な実装例 2. 脆弱性が発生する理由 3. 想定される攻撃シナリオ 4. CodeQL などによる検出方法(実測) 5. 修正方法(ヒント → 答え) 6. 修正後のテスト 7. 検出できないケースやツールの限界

### ディレクトリ構成

```
security-labs/
  NN-<テーマ>/
    README.md                   ← 上の7項目
    vulnerable/app.ts.txt       ← 脆弱版(.txt なので、実行・ビルド・解析されない)
    solution/app.ts.txt         ← 修正版(最後に読む)
    security.test.ts.txt        ← 攻撃を防げているかのテスト(変更しない)
```

## メンテナ向け: 演習の健全性の検証

```bash
npm run lab:verify     # CIでも実行。脆弱版: 正常な利用は成功・攻撃を防ぐテストが失敗 / 修正版: 全部成功
```
演習を追加するとき: `NN-<名前>/` に上の4ファイルを作る。テストは、`describe('正常な利用', ...)`(脆弱版でも通る)と、攻撃を防ぐテスト(脆弱版では失敗する)に分ける。
