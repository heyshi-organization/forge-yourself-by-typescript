# 課題02: ジェネリクス(Result / Page)

**週2** / 実装場所: `starter/src/shared/result.ts`, `starter/src/shared/page.ts`

## 1. 課題の目的

「失敗するかもしれない値」を表す `Result<T, E>` と、ページ付き一覧の `Page<T>` を、**ジェネリクス**で書く。
中身の型が何であっても使える部品を、型安全に(`any` を使わずに)作る。このあと、サービス層・プロビジョナーが `Result` を返す。

## 2. 学習する概念

ジェネリクス(型引数) / 型引数の推論 / `never` の役割 / Utility Types / 型ガードによる絞り込み / 例外と Result の使い分け

## 3. 背景知識

```ts
// ジェネリック関数: T は呼び出し時に推論される
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}
first([1, 2, 3]); // T = number
first(['a']); // T = string

// ジェネリックな型
interface Box<T> {
  value: T;
}
type NumBox = Box<number>;
```

**なぜ Result?** 例外は、関数のシグネチャに現れない(呼び出し側が「失敗しうる」ことを忘れても、コンパイルが通る)。
`Result<T, E>` は「成功なら `T`、失敗なら `E`」を**戻り値の型**にするので、扱いを忘れるとコンパイルエラーになる。

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }; // ← 判別可能Union(課題01)

const r: Result<number, string> = parse(input);
if (r.ok) {
  r.value; /* number */
} else {
  r.error; /* string */
}
```

**`never` の役割**: `ok(1)` は「失敗しない」Result なので `Result<number, never>`、`err('x')` は `Result<never, string>`。
`never` は「値が存在しない」型で、`T | never = T`。だから `Result<number, never>` は、どんな `Result<number, E>` にも代入できる。

使い分け(このプロジェクトの方針): **起こりうる失敗(業務上の結果)は `Result`**、プログラムのバグや想定外(DB障害など)は例外。

## 4. 実装する機能

### `shared/result.ts`

| 名前                         | 仕様                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `Result<T, E>`               | 判別可能Union。成功: `{ ok: true, value: T }`、失敗: `{ ok: false, error: E }`(両方 `readonly`) |
| `ok(value)`                  | 成功を作る。戻り値の型は `Result<T, never>`                                                     |
| `err(error)`                 | 失敗を作る。戻り値の型は `Result<never, E>`                                                     |
| `map(result, fn)`            | 成功なら `fn(value)` に変換、失敗ならそのまま(`Result<U, E>`)                                   |
| `mapErr(result, fn)`         | 失敗なら `fn(error)` に変換、成功ならそのまま(`Result<T, F>`)                                   |
| `flatMap(result, fn)`        | 成功なら `fn(value)`(それ自体が Result)の結果、失敗ならそのまま。エラー型は `E \| F`            |
| `unwrapOr(result, fallback)` | 成功なら値、失敗なら `fallback`                                                                 |
| `collect(results)`           | 全部成功なら `ok(値の配列)`、**最初の**失敗があればその失敗                                     |
| `fromPromise(promise)`       | 例外を投げうる Promise を `Promise<Result<T, unknown>>` に変換(例外は `err` へ)                 |

### `shared/page.ts`

| 名前                              | 仕様                                                                      |
| --------------------------------- | ------------------------------------------------------------------------- |
| `Page<T>`                         | `items: readonly T[]`, `total: number`, `limit: number`, `offset: number` |
| `mapPage(page, fn)`               | `items` の要素だけを変換した `Page<U>`(total/limit/offset は保つ)         |
| `sliceToPage(all, limit, offset)` | 配列の `offset` から `limit` 件を `items` にし、`total` は `all.length`   |

## 5. 実装対象ファイル

`starter/src/shared/result.ts`, `starter/src/shared/page.ts`(`= any` の暫定の型を本物に)

## 6. 受け入れ条件

- [ ] `ok(1)` の型が `Result<number, never>`、`err('x')` の型が `Result<never, string>`
- [ ] `if (r.ok)` で絞り込むと、`r.value`(成功側)/ `r.error`(失敗側)が型安全に使え、逆側には触れない
- [ ] `map` / `mapErr` は片側の型だけを変える。`flatMap` のエラー型は `E | F`
- [ ] `collect` は最初のエラーで止まる。空配列は `ok([])`
- [ ] `fromPromise` は例外を `err` にする
- [ ] `Page<T>` / `mapPage` / `sliceToPage` が動き、型推論が効く(`Page<string>` になる)
- [ ] 実装に `any` を使っていない(型引数だけで書ける)

## 7. テスト方法

```bash
npm run exercise -- 02     # 実行時テスト(ex02-result-page.test.ts)+ 型テスト(ex02-generics.test-d.ts)
```

## 8. 段階的なヒント

<details><summary>ヒント1</summary>

`Result` は課題01の判別可能Unionと同じ考え方。`ok`/`err` は単にオブジェクトを返す関数。戻り値の型注釈(`Result<T, never>`)が肝。

</details>

<details><summary>ヒント2</summary>

`map` は「`result.ok` なら新しい `ok` を作る、そうでなければ `result` をそのまま返す」。
失敗側を返すとき、型は `Result<T, E>` から `Result<U, E>` に変わる点に注意(`result` をそのまま返してよい理由を考える)。

</details>

<details><summary>ヒント3</summary>

```ts
export function flatMap<T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? fn(result.value) : result;
}
```

`collect` は `for` ループで、失敗を見つけたら即 `return`。成功値は配列に貯める。

</details>

## 9. 発展課題

1. `tryCatch<T>(fn: () => T): Result<T, unknown>`(同期版 `fromPromise`)
2. 制約つきジェネリクス: `indexById<T extends { id: string }>(items: T[]): Record<string, T>`
3. `Result` を連鎖して書ける `pipe`(関数の配列を順に適用)。型がどこまで推論されるか観察する
4. `Awaited<ReturnType<typeof fromPromise<number>>>` が何になるか予想してから確認する

## 10. 完了後に理解しておくべきこと

- ジェネリクスは「型を引数にとる」仕組み。型引数は多くの場合**推論される**
- `never` は「ありえない」を表し、`Result<T, never>` のように「失敗しない」を表現できる
- 例外と `Result` の使い分け(失敗が型に現れる価値、ただし全部を `Result` にすると冗長になる)
- ジェネリクスで書くと、`any` を使わずに再利用できる
