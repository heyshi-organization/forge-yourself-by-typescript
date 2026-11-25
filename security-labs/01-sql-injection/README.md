# 演習 01-sql-injection: SQLインジェクション

> ⚠️ **意図的に脆弱なコードを使う演習**です。ローカルのテストの中だけで動かし、**ネットワークに公開しない・`main` にマージしない**こと。実在の秘密は使いません。
> 進め方: [security-labs/README.md](../README.md) / 課題文: [docs/exercises/11-security.md](../../docs/exercises/11-security.md)

```bash
npm run lab:start -- 01     # exercise/sec-01-sql-injection ブランチを作り、lab-workspace/01-sql-injection/ に展開
npm run lab:test -- 01      # 最初は失敗する(= 脆弱性がある)
```

分類: CWE-89

## 1. 脆弱な実装例

`GET /requests?status=...` が、クエリの `status` を **SQL文字列に直接連結**している。

- 脆弱版(読むのはこれ): [`vulnerable/app.ts.txt`](vulnerable/app.ts.txt)
- テスト(変更しない): [`security.test.ts.txt`](security.test.ts.txt)
- 修正版(**最後に**読む。先に自分で直す): [`solution/app.ts.txt`](solution/app.ts.txt)

## 2. 脆弱性が発生する理由

SQLの「構造」(`WHERE status = '...'`)と「データ」(`status` の値)が**同じ文字列**に混ざっている。値に `'` を含めると、データのつもりの部分が SQL の構造として解釈される。

## 3. 想定される攻撃シナリオ

```
GET /requests?status=PENDING' OR '1'='1                                   → 条件が常に真になり、全件が返る
GET /requests?status=x' UNION SELECT id, value, 'leak' FROM api_secrets -- → 別テーブル(秘密)の内容が混ぜて返る
GET /requests?status='                                                    → SQLエラーが返る(内部情報の漏洩にもなる)
```
**実際の攻撃では**、認証情報テーブルの読み出し、データの改ざん・削除(`; DROP TABLE ...`)に発展する(SQLiteの `exec` を使う場合など)。

## 4. CodeQL などによる検出方法(実測)

✅ **検出した**: `js/sql-injection`(**High**)「This query string depends on a user-provided value.」(`app.ts` の `db.prepare(...)` の行)。`better-sqlite3` の `prepare` は、CodeQL がSQL実行の sink として認識している。

> 実測の条件: このリポジトリの `codeql.yml`(`security-extended`)を、脆弱版 8 演習を `lab-workspace/` に展開した PR で実行(2026-11-25)。全体の結果は [security-labs/README.md](../README.md#codeql-の検出結果実測)。
> 検出の有無は CodeQL のバージョン・クエリの更新で変わる。**自分の PR で実際に確かめる**こと。

## 5. 修正方法

> 先に自分で修正すること。**ヒント → 修正方法**の順に。

<details><summary>ヒント1</summary>

外部入力が、SQLのどの部分(値/識別子)に使われているかを探す。

</details>

<details><summary>ヒント2</summary>

SQL文字列に `+` や `${}` で値を入れている箇所を `?` に置き換える。`db.prepare(sql).all(値)`。

</details>

<details><summary>ヒント3</summary>

`z.enum(['PENDING','PROCESSING','SUCCEEDED','FAILED'])` で `status` を検証し、不正なら 400 を返す。

</details>

<details><summary>修正方法(答え)</summary>

① **バインド変数**(`?`)で値を渡す(SQLの構造とデータを分離)。② 入力を**許可リスト**(`z.enum([...])`)で検証する。①だけでもインジェクションは防げるが、②で不正な入力を早期に 400 にできる(多層防御)。

実装例: [`solution/app.ts.txt`](solution/app.ts.txt)

</details>

## 6. 修正後のテスト

`security.test.ts`: 正常な絞り込み / `OR 1=1` で全件が返らない / `UNION` で秘密が漏れない / SQLを壊す入力でSQLエラーが返らない。

```bash
npm run lab:test -- 01      # すべて通ること(正常な利用も壊れていないこと)
```

## 7. 検出できないケースやツールの限界

- CodeQL は「**外部入力 → SQL文字列**」の流れを追う。**SQLを組み立てる処理が複雑**(ORM のクエリビルダを経由・動的なテーブル名/列名)だと、見逃すことがある。逆に、**検証済みの値**が流れていても検出する(誤検知。許可リストで検証していても、その検証を CodeQL が「サニタイズ」と認識しなければアラートが残る)
- 識別子(テーブル名・列名・`ORDER BY` の列)は**バインド変数にできない**。許可リストで対応する(CodeQL が検出できないことがある)
