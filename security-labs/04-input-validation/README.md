# 演習 04-input-validation: 入力値検証の不備(Mass Assignment)

> ⚠️ **意図的に脆弱なコードを使う演習**です。ローカルのテストの中だけで動かし、**ネットワークに公開しない・`main` にマージしない**こと。実在の秘密は使いません。
> 進め方: [security-labs/README.md](../README.md) / 課題文: [docs/exercises/11-security.md](../../docs/exercises/11-security.md)

```bash
npm run lab:start -- 04     # exercise/sec-04-input-validation ブランチを作り、lab-workspace/04-input-validation/ に展開
npm run lab:test -- 04      # 最初は失敗する(= 脆弱性がある)
```

分類: CWE-20 / CWE-915

## 1. 脆弱な実装例

`POST /requests` が、ボディを `as CreateRequestBody`(**型アサーション**)で受け取り、**そのままレコードに展開**(`...body`)している。`GET /requests` の `limit` も検証せず `Number()` している。

- 脆弱版(読むのはこれ): [`vulnerable/app.ts.txt`](vulnerable/app.ts.txt)
- テスト(変更しない): [`security.test.ts.txt`](security.test.ts.txt)
- 修正版(**最後に**読む。先に自分で直す): [`solution/app.ts.txt`](solution/app.ts.txt)

## 2. 脆弱性が発生する理由

TypeScript の型は**実行時に消える**。`as` は「そうだと主張する」だけで、何も検査しない(課題04)。クライアントは、型に無いフィールド(`status` `owner`)も、不正な値(数値でない `name`)も送れる。サーバー側で決めるべき項目をクライアントが上書きできる(**Mass Assignment**)。

## 3. 想定される攻撃シナリオ

```
POST /requests {"name":"x","visibility":"private","status":"SUCCEEDED","owner":"admin"}   → status・owner を勝手に指定できる
POST /requests {"name":123,"visibility":"private"}                                          → 型が違う値がそのまま保存される
GET  /requests?limit=-1  /  ?limit=abc  /  ?limit=1000000                                  → NaN・負数・巨大値で想定外の動作
```

## 4. CodeQL などによる検出方法(実測)

❌ **検出しなかった**(実測。`js/missing-rate-limiting` 以外のアラートなし)。Mass Assignment・型アサーションは「外部入力が危険な関数に流れる」パターンではなく、**仕様(どのフィールドを受け付けるか)の問題**なので、taint tracking では見つけられない。

> 実測の条件: このリポジトリの `codeql.yml`(`security-extended`)を、脆弱版 8 演習を `lab-workspace/` に展開した PR で実行(2026-11-25)。全体の結果は [security-labs/README.md](../README.md#codeql-の検出結果実測)。
> 検出の有無は CodeQL のバージョン・クエリの更新で変わる。**自分の PR で実際に確かめる**こと。

## 5. 修正方法

> 先に自分で修正すること。**ヒント → 修正方法**の順に。

<details><summary>ヒント1</summary>

`req.body as X` は何を検査している?(何も)

</details>

<details><summary>ヒント2</summary>

Zod で `z.object({...}).strict()` を定義し、`safeParse` する。失敗したら 400。

</details>

<details><summary>ヒント3</summary>

`{ id, status: 'PENDING', owner: 'anonymous', ...parsed.data }` — サーバーが決める項目を**先に**置き、検証済みの値を後ろに(スキーマに無いので上書きされない)。

</details>

<details><summary>修正方法(答え)</summary>

① **Zod の `strict()`** で、想定外のフィールドを拒否する。② 型は `z.infer` で導出(`as` を使わない)。③ サーバー側で決める項目(`status` `owner`)は、**入力から切り離して**サーバーが設定する。④ クエリは `z.coerce.number().int().min(1).max(100)` で検証。

実装例: [`solution/app.ts.txt`](solution/app.ts.txt)

</details>

## 6. 修正後のテスト

`security.test.ts`: 正常な作成 / `status`・`owner` を指定しても上書きできない(拒否または無視)/ 型の違い・空・パス区切り・不正な列挙値・必須項目なし・配列 は 400 / 不正な `limit` は 400 / `limit` 既定値。

```bash
npm run lab:test -- 04      # すべて通ること(正常な利用も壊れていないこと)
```

## 7. 検出できないケースやツールの限界

- **検出できない**。入力検証の不備は、「どこまで検証すれば十分か」が**仕様**に依存する。レビュー・テスト・スキーマ駆動の設計で守る
- 学習ポイント: `strict()` を忘れても、コンパイルもテストも通ってしまう(静かに無視される)。**「想定外の入力を送るテスト」を書く**ことが重要
