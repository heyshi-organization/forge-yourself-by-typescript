# exercises — 課題の受け入れテスト

課題ごとの**受け入れ条件を機械的に検証するテスト**です。**同じテストを、完成形と学習者の実装の両方に実行**します(`@app/...` の指す先が違うだけ)。

```
tests/exNN-*.test.ts     実行時のテスト(Vitest)。it('…') の日本語が受け入れ条件
tests/exNN-*.test-d.ts   型のテスト(expectTypeOf)。コンパイルが通れば合格
mutants/retry.json       課題07: テストの強さを測る「バグ入り実装」の定義
```

```bash
npm run exercise -- 03             # 課題03(あなたの starter を検査)
npm run exercise                   # 全課題の進捗
npm run exercise:verify            # 完成形で全部実行(教材の自己検証。CIで実行)
```

テストは**仕様書として読んでよい**ですが、テストを通すためだけの実装(入力の決め打ち)はしないこと。
課題の仕様は [docs/exercises/](../docs/exercises/README.md) にあります。仕組み: [ADR-0004](../docs/adr/0004-repository-layout.md)。
