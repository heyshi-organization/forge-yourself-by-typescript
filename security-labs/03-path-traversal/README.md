# 演習 03-path-traversal: パストラバーサル

> ⚠️ **意図的に脆弱なコードを使う演習**です。ローカルのテストの中だけで動かし、**ネットワークに公開しない・`main` にマージしない**こと。実在の秘密は使いません。
> 進め方: [security-labs/README.md](../README.md) / 課題文: [docs/exercises/11-security.md](../../docs/exercises/11-security.md)

```bash
npm run lab:start -- 03     # exercise/sec-03-path-traversal ブランチを作り、lab-workspace/03-path-traversal/ に展開
npm run lab:test -- 03      # 最初は失敗する(= 脆弱性がある)
```

分類: CWE-22

## 1. 脆弱な実装例

`GET /templates?name=...` が、`name` を `join(baseDir, 'templates', name)` に渡して**ファイルを読んでいる**。

- 脆弱版(読むのはこれ): [`vulnerable/app.ts.txt`](vulnerable/app.ts.txt)
- テスト(変更しない): [`security.test.ts.txt`](security.test.ts.txt)
- 修正版(**最後に**読む。先に自分で直す): [`solution/app.ts.txt`](solution/app.ts.txt)

## 2. 脆弱性が発生する理由

`..`(親ディレクトリ)を含む入力で、`templates/` の**外**を指せる。`join` は `..` を解決するだけで、「基点の内側に収まっているか」は確認しない。

## 3. 想定される攻撃シナリオ

```
GET /templates?name=../secret.txt        → templates の外のファイルが読める
GET /templates?name=a/../../secret.txt   → 多段の ..
GET /templates?name=..%2Fsecret.txt      → URLエンコードされた区切り(クエリでは自動で復号される)
```
**実際の攻撃では**、設定ファイル・秘密鍵・`/etc/passwd`・`.env` の読み出しに使われる。

## 4. CodeQL などによる検出方法(実測)

✅ **検出した**: `js/path-injection`(**High**)「This path depends on a user-provided value.」(`readFileSync` の行)

> 実測の条件: このリポジトリの `codeql.yml`(`security-extended`)を、脆弱版 8 演習を `lab-workspace/` に展開した PR で実行(2026-11-25)。全体の結果は [security-labs/README.md](../README.md#codeql-の検出結果実測)。
> 検出の有無は CodeQL のバージョン・クエリの更新で変わる。**自分の PR で実際に確かめる**こと。

## 5. 修正方法

> 先に自分で修正すること。**ヒント → 修正方法**の順に。

<details><summary>ヒント1</summary>

`..` や `/` を含む名前で、どこまで遡れるか実際に試す(テストが失敗する入力を見る)。

</details>

<details><summary>ヒント2</summary>

まず、名前に使える文字を限定する(正規表現)。

</details>

<details><summary>ヒント3</summary>

`realpathSync` でシンボリックリンクを解決し、基点の内側かを `startsWith(基点 + path.sep)` で確認する。

</details>

<details><summary>修正方法(答え)</summary>

① **許可リスト**: ファイル名として使える文字だけ(`^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`。`/` や `..` を含めない)。② **多層防御**: `realpathSync(resolve(基点, name))`(**シンボリックリンクを解決した実体のパス**)が、基点の実体のパス + `/` で始まることを確認する。

実装例: [`solution/app.ts.txt`](solution/app.ts.txt)

</details>

## 6. 修正後のテスト

`security.test.ts`: 正常な読み出し / `../` 多段 / 絶対パス / NULL文字 / Windows区切り / **シンボリックリンク**経由で外のファイルが読めない。

```bash
npm run lab:test -- 03      # すべて通ること(正常な利用も壊れていないこと)
```

## 7. 検出できないケースやツールの限界

- 検証と使用の間にファイルが差し替えられる(**TOCTOU**)競合は、コードを読んでも CodeQL では検出されない
- **検証してあるのに検出する**(誤検知): 自作の検証関数(`startsWith` 等)を CodeQL がサニタイザと認識しないことがある。dismiss する前に、本当に安全か**テストで確かめる**
- 学習ポイント: `join('base','templates','/etc/passwd')` は `base/templates/etc/passwd` になる(絶対パスにはならない)が、**`resolve`** を使うと絶対パスが優先される。使う関数で挙動が違う
