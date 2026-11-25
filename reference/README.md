# reference — 完成形(答え合わせ用)

> ⚠️ **学習者は、最初は見ないでください。** 自分で設計・実装してから、詰まったときや答え合わせに使います。
> 「見たら、閉じて自分で書き直す」ことが学習になります。

これは、`Repository Provisioning Service` の完成形の実装とテストです。

```
reference/
├── src/         完成形の実装(starter/src の元)
├── test/        結合テスト・OpenAPI・Octokit クライアントのテスト
└── test-live/   実GitHub APIを使うテスト(通常は実行されない。docs/testing-strategy.md)
```

- `src/` には `// @starter-begin exNN` ... `// @starter-else` ... `// @starter-end` というマーカーがあります。**学習者の雛形(`starter/src`)を自動生成するための印**です。
  `// @starter-else` と `// @starter-end` の間の `//|` で始まる行は、starter に出力される内容で、実装の一部ではありません(読み飛ばしてよい)
- 完成形を変更したら: `npm run starter:generate` → `npm run verify`(メンテナ向け。[ADR-0004](../docs/adr/0004-repository-layout.md))
- 完成形を動かす: `npm run dev`([docs/development-environment.md](../docs/development-environment.md))
