# 演習 08-ssrf: SSRF(Server-Side Request Forgery)

> ⚠️ **意図的に脆弱なコードを使う演習**です。ローカルのテストの中だけで動かし、**ネットワークに公開しない・`main` にマージしない**こと。実在の秘密は使いません。
> 進め方: [security-labs/README.md](../README.md) / 課題文: [docs/exercises/11-security.md](../../docs/exercises/11-security.md)

```bash
npm run lab:start -- 08     # exercise/sec-08-ssrf ブランチを作り、lab-workspace/08-ssrf/ に展開
npm run lab:test -- 08      # 最初は失敗する(= 脆弱性がある)
```

分類: CWE-918

## 1. 脆弱な実装例

`GET /avatar?url=...` が、利用者の指定したURLに**サーバーがそのままリクエスト**している。

- 脆弱版(読むのはこれ): [`vulnerable/app.ts.txt`](vulnerable/app.ts.txt)
- テスト(変更しない): [`security.test.ts.txt`](security.test.ts.txt)
- 修正版(**最後に**読む。先に自分で直す): [`solution/app.ts.txt`](solution/app.ts.txt)

## 2. 脆弱性が発生する理由

サーバーは、外部からは届かない**内側のネットワーク**(`127.0.0.1`・社内システム・クラウドの**メタデータサービス**)にアクセスできる。利用者にURLを指定させると、**サーバーを踏み台**にして、内側のサービスを読み出せる。

## 3. 想定される攻撃シナリオ

```
GET /avatar?url=http://127.0.0.1:8080/admin                         → サーバー自身の管理画面を読む
GET /avatar?url=http://169.254.169.254/latest/meta-data/iam/...      → クラウドの認証情報(メタデータ)を窃取する
GET /avatar?url=file:///etc/passwd                                  → ローカルファイル(実装によっては)
```
**実際の攻撃では**、クラウド環境の認証情報の窃取(大規模な情報漏洩の原因になった事例が多数ある)。

## 4. CodeQL などによる検出方法(実測)

✅ **検出した**: `js/request-forgery`(**Critical**)「The URL of this request depends on a user-provided value.」(`fetch(url)` の行)

> 実測の条件: このリポジトリの `codeql.yml`(`security-extended`)を、脆弱版 8 演習を `lab-workspace/` に展開した PR で実行(2026-11-25)。全体の結果は [security-labs/README.md](../README.md#codeql-の検出結果実測)。
> 検出の有無は CodeQL のバージョン・クエリの更新で変わる。**自分の PR で実際に確かめる**こと。

## 5. 修正方法

> 先に自分で修正すること。**ヒント → 修正方法**の順に。

<details><summary>ヒント1</summary>

`fetch(url)` の `url` は誰が決めている?そのURLが指せる場所を列挙する。

</details>

<details><summary>ヒント2</summary>

`new URL(raw)` でパースし、`protocol` `hostname` `port` `username` を**個別に**検査する。

</details>

<details><summary>ヒント3</summary>

`fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) })`。

</details>

<details><summary>修正方法(答え)</summary>

① **許可リスト**: スキームは `https` のみ、ホストは**完全一致**(`avatars.githubusercontent.com`)、ポートは指定なし、URL内の認証情報(`user:pass@`)は拒否。**前方一致・部分一致は使わない**(`avatars.githubusercontent.com.evil.example`)。② `redirect: 'error'`(許可ホストから内部へ**リダイレクトされる**のを防ぐ)。③ `AbortSignal.timeout`(いつまでも待たない)。④ 拒否リスト(`127.0.0.1` を禁止)は、`0x7f.1`・`[::1]`・DNS の細工で破られやすいので**使わない**。

実装例: [`solution/app.ts.txt`](solution/app.ts.txt)

</details>

## 6. 修正後のテスト

`security.test.ts`: 許可ホストは取得できる / ループバック・localhost・メタデータ・プライベートIP・`file:`・許可外ホスト・前方一致の偽装・認証情報による偽装・http・想定外ポート・URLでない値 は拒否し、**リクエストを送らない** / リダイレクトを追従しない / タイムアウトがある。(グローバルの `fetch` を差し替えて、実際の通信はしない)

```bash
npm run lab:test -- 08      # すべて通ること(正常な利用も壊れていないこと)
```

## 7. 検出できないケースやツールの限界

- CodeQL は、検証関数が**不十分**でも、サニタイザと認識して検出をやめることがある(逆に、十分でも検出することがある)。**検証の中身は、テストで確かめる**
- **DNS リバインディング**(検証時と接続時でIPが変わる)・**IPの別表記**は、ホスト名の許可リストだけでは防げないことがある。許可ホストが固定で、httpsなら実害は小さい。任意のURLを許す設計なら、解決後のIPの確認と、ネットワークレベルの制限(egressのフィルタ)が必要
- 学習ポイント: 「危険なものを禁止する」(拒否リスト)より、「許すものだけ許す」(許可リスト)
