# 演習 02-command-injection: コマンドインジェクション

> ⚠️ **意図的に脆弱なコードを使う演習**です。ローカルのテストの中だけで動かし、**ネットワークに公開しない・`main` にマージしない**こと。実在の秘密は使いません。
> 進め方: [security-labs/README.md](../README.md) / 課題文: [docs/exercises/11-security.md](../../docs/exercises/11-security.md)

```bash
npm run lab:start -- 02     # exercise/sec-02-command-injection ブランチを作り、lab-workspace/02-command-injection/ に展開
npm run lab:test -- 02      # 最初は失敗する(= 脆弱性がある)
```

分類: CWE-78

## 1. 脆弱な実装例

`GET /repo-info?name=...` が、`name` を**シェルのコマンド文字列に連結**して `exec` している。

- 脆弱版(読むのはこれ): [`vulnerable/app.ts.txt`](vulnerable/app.ts.txt)
- テスト(変更しない): [`security.test.ts.txt`](security.test.ts.txt)
- 修正版(**最後に**読む。先に自分で直す): [`solution/app.ts.txt`](solution/app.ts.txt)

## 2. 脆弱性が発生する理由

`exec` は文字列を**シェル**(`sh -c`)に渡す。シェルは `;` `&&` `|` `` ` `` `$()` 改行を**コマンドの区切り・置換として解釈**する。入力がコマンドの「引数」ではなく「コマンドの一部」になる。

## 3. 想定される攻撃シナリオ

```
GET /repo-info?name=demo; echo INJECTED          → echo INJECTED が実行される(任意のコマンドが実行できる)
GET /repo-info?name=demo $(cat /etc/passwd)      → コマンド置換でファイルの内容が出力に混ざる
```
**実際の攻撃では**、サーバー上で任意のコマンドが実行され(RCE)、秘密(環境変数のトークン)の窃取・マルウェアの設置に至る。最も深刻な脆弱性の1つ。

## 4. CodeQL などによる検出方法(実測)

✅ **検出した**: `js/command-line-injection`(**Critical**)「This command line depends on a user-provided value.」

> 実測の条件: このリポジトリの `codeql.yml`(`security-extended`)を、脆弱版 8 演習を `lab-workspace/` に展開した PR で実行(2026-11-25)。全体の結果は [security-labs/README.md](../README.md#codeql-の検出結果実測)。
> 検出の有無は CodeQL のバージョン・クエリの更新で変わる。**自分の PR で実際に確かめる**こと。

## 5. 修正方法

> 先に自分で修正すること。**ヒント → 修正方法**の順に。

<details><summary>ヒント1</summary>

`exec` はシェルを起動する。入力がシェルにどう解釈されるか考える。

</details>

<details><summary>ヒント2</summary>

`child_process.execFile(コマンド, [引数...])` はシェルを使わない。

</details>

<details><summary>ヒント3</summary>

許可リストの正規表現で `name` を検証し、不正なら 400。`.`・`..` も拒否する。

</details>

<details><summary>修正方法(答え)</summary>

① **シェルを介さない** `execFile('echo', ['repository:', name])` — 引数は配列で渡され、`;` などは**ただの文字**になる。② 入力を**許可リスト**(`^[A-Za-z0-9._-]{1,100}$`)で検証。③ そもそも外部コマンドが本当に必要か考える(ライブラリで代替できないか)。

実装例: [`solution/app.ts.txt`](solution/app.ts.txt)

</details>

## 6. 修正後のテスト

`security.test.ts`: 正常な表示 / `;` `&&` `|` `$()` `` ` `` 改行 のいずれでも、別のコマンドが実行されない。

```bash
npm run lab:test -- 02      # すべて通ること(正常な利用も壊れていないこと)
```

## 7. 検出できないケースやツールの限界

- `execFile` でも、**引数にオプションとして解釈される値**(`-rf` など `-` で始まる文字列)を渡すと、コマンドによっては危険(**引数インジェクション**)。`--` で区切る・先頭の `-` を拒否する。CodeQL はこれを区別しないことがある
- 入力が**一度ファイルやDBに保存されてから**コマンドに使われる場合(2次的インジェクション)は、データの流れが途切れて検出できないことがある
