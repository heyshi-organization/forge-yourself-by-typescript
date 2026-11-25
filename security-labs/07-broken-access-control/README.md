# 演習 07-broken-access-control: 認可の欠如(IDOR・権限の詐称)

> ⚠️ **意図的に脆弱なコードを使う演習**です。ローカルのテストの中だけで動かし、**ネットワークに公開しない・`main` にマージしない**こと。実在の秘密は使いません。
> 進め方: [security-labs/README.md](../README.md) / 課題文: [docs/exercises/11-security.md](../../docs/exercises/11-security.md)

```bash
npm run lab:start -- 07     # exercise/sec-07-broken-access-control ブランチを作り、lab-workspace/07-broken-access-control/ に展開
npm run lab:test -- 07      # 最初は失敗する(= 脆弱性がある)
```

分類: CWE-639 / CWE-862 / CWE-285

## 1. 脆弱な実装例

① `GET/DELETE /items/:id` が、**持ち主かどうかを確認しない**(IDOR)。② `/admin/stats` が、**クライアントが送る `x-role` ヘッダ**で管理者かを判断している。

- 脆弱版(読むのはこれ): [`vulnerable/app.ts.txt`](vulnerable/app.ts.txt)
- テスト(変更しない): [`security.test.ts.txt`](security.test.ts.txt)
- 修正版(**最後に**読む。先に自分で直す): [`solution/app.ts.txt`](solution/app.ts.txt)

## 2. 脆弱性が発生する理由

**認証**(誰か)と**認可**(その人に、このデータ・操作を許してよいか)は別。IDを変えるだけで他人のデータに触れる、ヘッダを書き換えるだけで管理者になれるのは、**サーバーが権限をクライアントの申告に任せている**から。

## 3. 想定される攻撃シナリオ

```
bob: GET    /items/1                        (alice のデータ)  → そのまま読める(IDORと呼ばれる。IDは連番で推測しやすい)
bob: DELETE /items/1                                          → alice のデータを消せる
bob: GET    /admin/stats  x-role: admin                       → 管理者になりすませる
```

## 4. CodeQL などによる検出方法(実測)

❌ **検出しなかった**(実測。アラートなし)。「**このユーザーにこの操作を許してよいか**」は**アプリの仕様**で、コードのパターンからは判断できない。**SASTが最も苦手な分野**。

> 実測の条件: このリポジトリの `codeql.yml`(`security-extended`)を、脆弱版 8 演習を `lab-workspace/` に展開した PR で実行(2026-11-25)。全体の結果は [security-labs/README.md](../README.md#codeql-の検出結果実測)。
> 検出の有無は CodeQL のバージョン・クエリの更新で変わる。**自分の PR で実際に確かめる**こと。

## 5. 修正方法

> 先に自分で修正すること。**ヒント → 修正方法**の順に。

<details><summary>ヒント1</summary>

各エンドポイントで「**誰が**この操作をしてよいか」を、ルールとして書き出す。

</details>

<details><summary>ヒント2</summary>

`USERS`(サーバー側の表)から役割を引く。ヘッダで受け取るのは「誰か」だけで、「何者か(役割)」は引かない。

</details>

<details><summary>ヒント3</summary>

「持ち主 or 管理者」の判定を1つの関数にして、取得・削除の両方で使う。見つからない/許可されないは、同じ 404。

</details>

<details><summary>修正方法(答え)</summary>

① 権限は**サーバー側のデータ**(ユーザー表・トークンの検証結果)で決める。クライアントが送るヘッダ(`x-role`)は信用しない。② **すべてのエンドポイントで**、認証 → 認可(持ち主か・管理者か)を確認する。③ 他人のデータは `403` ではなく `404`(存在の有無も隠す)。④ 認可のチェックは**共通の関数**にして、書き忘れを防ぐ。

実装例: [`solution/app.ts.txt`](solution/app.ts.txt)

</details>

## 6. 修正後のテスト

`security.test.ts`: 持ち主は取得・削除できる / 管理者は統計を見られる / **他のユーザーは他人のデータを取得・削除できない** / 一般ユーザーは管理機能を使えない / `x-role` を偽装しても管理者になれない / 未認証は 401。

```bash
npm run lab:test -- 07      # すべて通ること(正常な利用も壊れていないこと)
```

## 7. 検出できないケースやツールの限界

- **SASTでは検出できない**。認可は仕様そのものなので、**テスト**(「他人としてアクセスして失敗すること」を各エンドポイントで書く)・設計レビュー・脅威モデリングで守る
- 検出されるかもしれない別の指摘(`js/missing-rate-limiting` など)と、**本当に重大な脆弱性(認可の欠如)が、ツールの出力に出ない**ことの対比が学習ポイント。ツールが静かでも安全とは限らない
- この演習の認証は**簡易**(`x-user` ヘッダ)で、それ自体が本番では使えない(署名付きトークン・セッション等が必要)
