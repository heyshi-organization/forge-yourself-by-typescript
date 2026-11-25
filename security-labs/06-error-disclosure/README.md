# 演習 06-error-disclosure: エラー情報の過剰な公開

> ⚠️ **意図的に脆弱なコードを使う演習**です。ローカルのテストの中だけで動かし、**ネットワークに公開しない・`main` にマージしない**こと。実在の秘密は使いません。
> 進め方: [security-labs/README.md](../README.md) / 課題文: [docs/exercises/11-security.md](../../docs/exercises/11-security.md)

```bash
npm run lab:start -- 06     # exercise/sec-06-error-disclosure ブランチを作り、lab-workspace/06-error-disclosure/ に展開
npm run lab:test -- 06      # 最初は失敗する(= 脆弱性がある)
```

分類: CWE-209

## 1. 脆弱な実装例

例外の `message` と `stack`(スタックトレース)を、**そのままレスポンスで返している**。

- 脆弱版(読むのはこれ): [`vulnerable/app.ts.txt`](vulnerable/app.ts.txt)
- テスト(変更しない): [`security.test.ts.txt`](security.test.ts.txt)
- 修正版(**最後に**読む。先に自分で直す): [`solution/app.ts.txt`](solution/app.ts.txt)

## 2. 脆弱性が発生する理由

エラーには、DBの種類・テーブル名・SQL・サーバー内のファイルパス・使っているライブラリとバージョンなど、**攻撃者にとって有益な情報**が含まれる。利用者(攻撃者を含む)に必要なのは「失敗した」と「問い合わせ用のID」だけ。

## 3. 想定される攻撃シナリオ

```
1. わざとエラーを起こす入力を送る(存在しない型・長い値・特殊文字)
2. レスポンスの `error: "no such table: requests"`, `stack: "at Database.prepare (/app/node_modules/better-sqlite3/...)"` から、DB・テーブル名・パス・ライブラリを知る
3. 次の攻撃(SQLインジェクションの調整・既知の脆弱性の悪用)の足がかりにする
```

## 4. CodeQL などによる検出方法(実測)

❌ **検出しなかった**(実測。`js/missing-rate-limiting` 以外のアラートなし)。`js/stack-trace-exposure` というクエリはあるが、**この書き方(Fastify の `reply.status(500).send({...})`)では検出されなかった**。フレームワークのレスポンスAPIの扱いに依存する(他のフレームワークの書き方では検出されることがあるが、**今回は確認していない=未検証**)。

> 実測の条件: このリポジトリの `codeql.yml`(`security-extended`)を、脆弱版 8 演習を `lab-workspace/` に展開した PR で実行(2026-11-25)。全体の結果は [security-labs/README.md](../README.md#codeql-の検出結果実測)。
> 検出の有無は CodeQL のバージョン・クエリの更新で変わる。**自分の PR で実際に確かめる**こと。

## 5. 修正方法

> 先に自分で修正すること。**ヒント → 修正方法**の順に。

<details><summary>ヒント1</summary>

レスポンスに含まれる情報を、1つずつ「攻撃者に役立つか」で判断する。

</details>

<details><summary>ヒント2</summary>

`crypto.randomUUID()` で `errorId` を作り、`log({ errorId, error })`(内部)と `send({ error: 'internal error', errorId })`(外部)。

</details>

<details><summary>ヒント3</summary>

この問題は、各ハンドラの `try/catch` ではなく、**共通のエラーハンドラ**で解決するのが本筋(課題05)。

</details>

<details><summary>修正方法(答え)</summary>

① 利用者には**定型メッセージ**と**問い合わせ用ID**(`errorId`)だけを返す。② 詳細(`error`・スタック)は**内部ログにだけ**残し、IDで突き合わせる。③ 想定外の例外は、**1か所のエラーハンドラ**で変換する(このプロジェクトの `http/errors.ts`)。

実装例: [`solution/app.ts.txt`](solution/app.ts.txt)

</details>

## 6. 修正後のテスト

`security.test.ts`: 正常な取得 / DB障害のとき、レスポンスに DB名・テーブル名・スタックトレース・ファイルパスが含まれない / 問い合わせIDは返し、詳細は内部ログに残る。

```bash
npm run lab:test -- 06      # すべて通ること(正常な利用も壊れていないこと)
```

## 7. 検出できないケースやツールの限界

- **検出は、使っているフレームワークがモデル化されているか**に依存する。同じ脆弱性でも、書き方で検出される/されないが変わる(これは SAST 全般の限界)
- エラー**以外**の経路(デバッグ用エンドポイント・ヘッダ・ログの公開・`NODE_ENV`による分岐の漏れ)の情報漏洩は検出できない
- テスト(障害を**再現して**レスポンスを検査する)が、最も確実
