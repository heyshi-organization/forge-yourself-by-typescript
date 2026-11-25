# ADR-0004: リポジトリ構成と教材の作り方

- 状態: 採用
- 日付: 2026-11-25

## 背景

1つのリポジトリに、完成形(`reference/`)・学習用の未完成コード(`starter/`)・教材(`docs/`)を置く。
「学習者が完成形を誤って参照しない」「完成形を変えたとき starter がずれない」「課題の合否を機械的に判定できる」ことが必要。

## 決定

### 1. 1つの npm パッケージ(ワークスペースにしない)

`package.json` は1つ。`reference/` と `starter/` は同じ `src/` 構成(同じ相対パス)を持つ。
`@app/*` というパスエイリアスを、tsconfig と Vitest の設定で `reference/src` か `starter/src` に切り替える。

### 2. starter は reference から**生成**する

`reference/src` の中に、学習者に実装させる範囲をマーカーで書く(`scripts/generate-starter.mjs`)。

```ts
// @starter-begin ex03
...完成形...
// @starter-else
//| ...starter に出すコード(スタブ + TODO)...
// @starter-end
```

- `npm run starter:generate` で `starter/src` を再生成、`npm run starter:check` で同期を検査(reference を変更した PR の CI で実行)
- メリット: 型・インターフェース・「given(最初から用意されている部分)」が常に完成形と一致する。starter が型エラーで壊れない
- デメリット: reference のソースにマーカーが混ざる(読みにくくなる)→ 完成形を読むときは「マーカー内の `//|` 行は無視してよい」とREADMEに明記

### 3. 受け入れテストは1つだけ(`exercises/tests/`)

課題ごとの受け入れテスト(`exNN-*.test.ts`)は、**完成形と学習者の実装の両方に対して**同じものを実行する。

- `npm run exercise:verify`(CI): 完成形に対して実行 → テスト自体が正しいことの証明
- `npm run exercise -- 03`: 学習者の `starter/` に対して実行

テスト内の import は `@app/...` で書くので、同じファイルがどちらにも使える。完成形のテスト(`reference/test/`)は結合テスト・OpenAPI検査など、課題の範囲外のものだけ。
→ 「完成形のテストと学習用のテストが混同されない」: 置き場所(`reference/test` / `exercises/tests` / `starter/test`)と実行コマンドが別。

### 4. 例外的な課題

- 課題07(テストを書く): 学習者のテストを、わざとバグを仕込んだ実装に当てる**ミューテーション検査**で判定(`scripts/check-mutants.mjs`)
- 課題11(セキュリティ): `security-labs/`(ADR-0013)
- 課題12(CI/CD): `scripts/check-workflows.mjs` で学習者のワークフローを検査

## 結果

- 完成形を変えるとき: `reference` を直す → `npm run starter:generate` → `npm run verify`
- 学習者は `starter/` と `exercises/` と `docs/` だけを見ればよい(`reference/` は詰まったときの答え合わせ用)
