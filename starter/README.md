# starter — あなたが実装する場所

ここが、**学習者がコードを書く場所**です。最初は未実装(`NotImplementedError`)で、課題を進めるごとに動くアプリになっていきます。

```
starter/
├── src/        ← 実装する(TODO(exNN) と書かれた所)
├── test/       ← 自分で書くテスト(課題07)
└── ci/         ← 自分で書く CI ワークフロー(課題12)
```

## 見分け方

| 見えるもの | 意味 |
|---|---|
| `// TODO(ex03): ...` と `throw new NotImplementedError('03')` | **課題03で実装する**場所 |
| `export type Foo = any;` と `TODO(ex01)` | 型を自分で書く場所(`any` は「まだ書いていない」印) |
| それ以外のコード | 最初から用意された部分(**given**)。変更しない |

## 進め方

```bash
npm run exercise              # 進捗の一覧
npm run exercise -- 01        # 課題01の受け入れテスト(失敗したテスト名が、何ができていないかを教えてくれる)
npm run test:starter          # starter/test/ に自分で書いたテスト
npm run typecheck             # 型エラーが無いこと
```
課題文: [docs/exercises/](../docs/exercises/README.md)。**番号順に**進める(後ろの課題は、前の課題の実装を使う)。

## ルール

1. **`reference/`(完成形)は、最後の手段**。詰まったら、課題文のヒント1→2→3、次にAIに「自分の案」を見せて相談
2. given の部分は書き換えない(`starter/src/shared/not-implemented.ts` など)
3. `starter/src` を**自分で**直す。`starter/` は、`reference/` から自動生成した雛形で、**自分が実装した後は上書きしない**(`npm run starter:generate` は、メンテナ用。実行すると、あなたの実装が消える)
4. 新しいファイルを足す場合も、`@app/...`(= `starter/src/...`)から import する
