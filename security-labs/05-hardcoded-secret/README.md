# 演習 05-hardcoded-secret: 秘密情報のハードコード

> ⚠️ **意図的に脆弱なコードを使う演習**です。ローカルのテストの中だけで動かし、**ネットワークに公開しない・`main` にマージしない**こと。実在の秘密は使いません。
> 進め方: [security-labs/README.md](../README.md) / 課題文: [docs/exercises/11-security.md](../../docs/exercises/11-security.md)

```bash
npm run lab:start -- 05     # exercise/sec-05-hardcoded-secret ブランチを作り、lab-workspace/05-hardcoded-secret/ に展開
npm run lab:test -- 05      # 最初は失敗する(= 脆弱性がある)
```

分類: CWE-798

## 1. 脆弱な実装例

署名鍵と管理者パスワードが、**ソースコードに直接**書かれている(演習用のダミー値)。

- 脆弱版(読むのはこれ): [`vulnerable/app.ts.txt`](vulnerable/app.ts.txt)
- テスト(変更しない): [`security.test.ts.txt`](security.test.ts.txt)
- 修正版(**最後に**読む。先に自分で直す): [`solution/app.ts.txt`](solution/app.ts.txt)

## 2. 脆弱性が発生する理由

ソースコードは、Git履歴・クローン・fork・ビルド成果物・(公開リポジトリなら)インターネットに**永久に残る**。後からコードを書き換えても、履歴から取り出せる。環境ごとに変えられず、**漏れたときのローテーションもコード変更が必要**。

## 3. 想定される攻撃シナリオ

```
1. リポジトリ(または履歴)を読む → 署名鍵を入手
2. 鍵で任意のユーザーの有効なトークンを自分で作る(なりすまし) / 管理者パスワードで /admin に入る
```
公開リポジトリでは、**自動スキャン**(攻撃者のボット)が数分で漏洩したトークンを見つけて悪用する。

## 4. CodeQL などによる検出方法(実測)

❌ **検出しなかった**(実測)。`js/hardcoded-credentials` は、特定の**認証用API**(ユーザー名・パスワードを受け取る接続関数など)へ定数が流れるパターンを対象にしていて、この例(`createHmac` の鍵、`!==` による比較)は対象外だった。**GitHub の Secret Scanning**(トークンの形式を検出)も、ダミーの文字列は対象にならない。

> 実測の条件: このリポジトリの `codeql.yml`(`security-extended`)を、脆弱版 8 演習を `lab-workspace/` に展開した PR で実行(2026-11-25)。全体の結果は [security-labs/README.md](../README.md#codeql-の検出結果実測)。
> 検出の有無は CodeQL のバージョン・クエリの更新で変わる。**自分の PR で実際に確かめる**こと。

## 5. 修正方法

> 先に自分で修正すること。**ヒント → 修正方法**の順に。

<details><summary>ヒント1</summary>

秘密を、コードではなく**実行時の環境**から受け取る形にする。

</details>

<details><summary>ヒント2</summary>

`env.SIGNING_KEY` が無い・短いときは、`throw` して起動を止める。

</details>

<details><summary>ヒント3</summary>

`crypto.timingSafeEqual(Buffer, Buffer)`(長さが違うと例外なので、先に長さを比べる)。

</details>

<details><summary>修正方法(答え)</summary>

① 秘密は**環境変数**から受け取る(`.env` は `.gitignore`)。② **無ければ起動しない**(弱い既定値で動かさない)。長さの最低条件も検証。③ パスワードの比較は `timingSafeEqual`(一定時間)。④ 漏れたら**まず無効化(ローテーション)**。履歴の削除は二の次。

実装例: [`solution/app.ts.txt`](solution/app.ts.txt)

</details>

## 6. 修正後のテスト

`security.test.ts`: 正常なトークン発行 / 秘密が無い・短いと起動に失敗 / 鍵が違えば署名が違う / パスワードの一致のみ許可 / **ソースに、鍵・パスワード・トークンっぽい名前への長い文字列の代入が無い**(簡易スキャン)。

```bash
npm run lab:test -- 05      # すべて通ること(正常な利用も壊れていないこと)
```

## 7. 検出できないケースやツールの限界

- 静的解析では、**「秘密かどうか」を文脈から判断するのは難しい**(検出は名前・形式・使われ方のヒューリスティック)。検出できなくても安全とは限らない
- 専用ツール(Secret Scanning・gitleaks・trufflehog)は**形式が既知のトークン**に強いが、自作のパスワード・鍵は検出しにくい
- このリポジトリでは `scripts/scan-secrets.mjs` と、Secret Scanning・Push Protection(→ [ADR-0015](../docs/adr/0015-repository-security-settings.md))で多重に守っている
- **実在のトークンで検証しないこと**
