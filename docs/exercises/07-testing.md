# 課題07: テストを書く(ミューテーション検査)

**週7** / 実装場所: `starter/test/ex07-retry.test.ts`(**あなたがテストを書く**)

## 1. 課題の目的

これまでは「用意されたテストを通す」側だった。今回は**テストを書く側**。
目的は「テストを書くこと」ではなく、**バグを見つけられるテストを設計すること**。
あなたのテストが本当に役立つかを、わざとバグを仕込んだ `retry`(10種類)に当てて確かめる(**ミューテーション検査**)。

## 2. 学習する概念

ユニットテスト / AAA(Arrange-Act-Assert)/ 境界値 / テストダブル(Fake・Stub・Mock・Spy)/ `vi.fn()` / Property-based Testing(fast-check)/ **ミューテーションテスト** / カバレッジの限界 / 決定的なテスト(時間・乱数の注入)

## 3. 背景知識

### 良いテストの条件

| 悪いテスト                                                 | 良いテスト                                             |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| 実行されるだけで、結果を確認していない(カバレッジは上がる) | **結果(戻り値・副作用)を確認**している                 |
| 実装の内部に依存(どの関数を呼んだか)                       | **振る舞い**に依存(何が起きるべきか)                   |
| 時間・乱数・ネットワークに依存して不安定                   | 注入して**決定的**                                     |
| 1つのテストで何でも確認                                    | 1つのテストが1つのことを確認(失敗したとき原因が分かる) |

### Vitest の基本

```ts
import { describe, expect, it, vi } from 'vitest';
const fn = vi.fn().mockRejectedValueOnce(new Error('a')).mockResolvedValue('ok'); // 1回目は失敗、以降は成功
await expect(promise).rejects.toThrow('msg'); // 非同期の失敗の検証
expect(fn).toHaveBeenCalledTimes(3); // 呼び出し回数(使いすぎない)
```

### `retry` のテストを書きやすくする仕組み(課題03の設計)

`retry(fn, { policy, isRetryable, sleep, random, onRetry, delayHintMs })` — `sleep` と `random` が**注入できる**ので、
`sleep: async () => {}`(待たない)・`random: () => 0.5`(固定)にすれば、一瞬で・毎回同じ結果でテストできる。
待った時間を検証したければ、`sleep: vi.fn()` に渡された引数を見る。

### Property-based Testing

```ts
import fc from 'fast-check';
fc.assert(
  fc.property(fc.integer({ min: 1, max: 30 }), (attempt) => {
    const ms = computeBackoffMs(attempt, policy, Math.random);
    expect(ms).toBeLessThanOrEqual(policy.maxDelayMs); // どの attempt でも成り立つ「性質」
  }),
);
```

**例**(特定の入力)ではなく**性質**(どの入力でも成り立つこと)を書く。fast-check が入力を数百個、自動生成して試し、失敗すると最小の反例まで縮める。

### ミューテーションテストの考え方

コードに小さなバグ(演算子の変更・条件の削除・定数の変更…)を1つ入れた**ミュータント**を作り、テストを実行する。
**テストが失敗すれば「バグを検出できた」**(ミュータントを倒した)。通ってしまえば、**そのバグを見逃すテスト**。
カバレッジは「その行が実行されたか」しか分からないが、ミューテーションは「**その行が間違っていたら気づけるか**」を測る。

## 4. 実装する機能

`starter/test/ex07-retry.test.ts` に、`retry` と `computeBackoffMs`(`@app/async/retry.js`)のテストを書く。
`it.todo(...)` の骨組みがある。観点は自分で追加すること(以下は考えるための問い)。

| 観点             | 問い                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| 正常系           | 最初に成功したら、何回呼ばれる?`fn` に渡される `attempt` は?                                               |
| 再試行           | 失敗→失敗→成功のとき、結果と呼び出し回数は?待ち時間(`sleep` の引数)は?                                     |
| 上限             | `maxAttempts` を使い切ったとき、何が投げられる?その `attempts` と `lastError` は?**ちょうど何回**呼ばれる? |
| 再試行不可       | `isRetryable` が false のとき、何回呼ばれる?投げられるエラーは元のもの?ラップされない?                     |
| 待ち時間のヒント | `delayHintMs` があるとき、バックオフの代わりに使われる?ヒントが長すぎるとき、待つ?諦める?                  |
| コールバック     | `onRetry` は、いつ・何を引数に呼ばれる?                                                                    |
| バックオフ       | 失敗回数が増えると、上限はどう増える?頭打ちは?`random` の値で変わる?(`random=0` なら?)                     |
| 性質             | どんな `attempt`/`policy` でも成り立つことは?(整数・範囲)実行回数は `maxAttempts` を超えない?              |

## 5. 実装対象ファイル

`starter/test/ex07-retry.test.ts`(検査の対象はこのファイル)。複数のファイルに分けたい場合は、検査コマンドに列挙する: `node scripts/check-mutants.mjs starter/test/a.test.ts starter/test/b.test.ts`

## 6. 受け入れ条件

- [ ] 完成形の `retry` に対して、あなたのテストが**全部通る**(テスト自体が正しい)
- [ ] **10種類のミュータントをすべて検出**(`10/10`)
- [ ] テストの名前(`it('…')`)が、**何を保証しているか**を日本語で説明している
- [ ] Property-based テストを**少なくとも1つ**書いた(`fc.assert` / `fc.property`)
- [ ] 待ちを実際には行わない(`sleep` を注入)・乱数を固定している(テストが数ミリ秒で終わる)

## 7. テスト方法

```bash
npm run exercise -- 07
# 1. 完成形に対する実行 → 失敗したら、あなたのテストが間違っている
# 2. 10個のバグ入り実装に対する実行 → 失敗した(=検出した)数を表示。見逃した場合は「何を確認していないか」のヒントを表示
```

`npm run test:starter` でも、自分のテストを単独で実行できる(`@app/...` は starter の実装を指す)。

## 8. 段階的なヒント

<details><summary>ヒント1: まず簡単な所から</summary>

```ts
const noSleep = async () => {};
const policy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 };

it('3回目で成功する', async () => {
  const fn = vi
    .fn()
    .mockRejectedValueOnce(new Error('a'))
    .mockRejectedValueOnce(new Error('b'))
    .mockResolvedValue('ok');
  const result = await retry(fn, { policy, isRetryable: () => true, sleep: noSleep });
  expect(result).toBe('ok');
  expect(fn).toHaveBeenCalledTimes(3);
});
```

</details>

<details><summary>ヒント2: 見逃したミュータントの直し方</summary>

検査が出す「見逃したバグ」のヒント(例: _最大試行回数ちょうどで止まること…_)を読み、**そのバグが入った `retry` を想像して**、それを失敗させるテストを書く。
`maxAttempts: 3` で常に失敗する `fn` を使い、`toHaveBeenCalledTimes(3)`(2でも4でもない)と書く、など。**「ちょうど」を検証する**のがコツ。

</details>

<details><summary>ヒント3: 待ち時間の検証と性質</summary>

`sleep` を `vi.fn()` にして、`sleep.mock.calls.map(c => c[0])` が `[50, 100]` になるか確認(`random: () => 0.5`, `baseDelayMs: 100` なら 100×1×0.5=50, 100×2×0.5=100)。
性質: 「`computeBackoffMs` の結果は、常に `0 以上 min(maxDelayMs, base×2^(n-1)) 以下`」「`retry` は `fn` を `maxAttempts` 回より多く呼ばない」。

</details>

## 9. 発展課題

1. `withTimeout` や `mapWithConcurrency` のミュータントを**自分で5個考え**、`exercises/mutants/` に倣って JSON にして、自分のテストで検出できるか試す
2. `vi.useFakeTimers()` と `vi.advanceTimersByTimeAsync()` を使って、実際の `sleep` を使うテストを書く
3. テストの「読みやすさ」をレビューしてもらう(AAA が見分けられるか、名前が仕様になっているか)
4. 完成形のカバレッジを `npm run test:coverage` で見て、**カバレッジが 100% でも検出できないバグ**を1つ考える

## 10. 完了後に理解しておくべきこと

- カバレッジは「実行されたか」であって「検証されたか」ではない。テストの価値は**バグを見つける力**
- 時間・乱数・待機を注入すると、テストが速く、決定的になる
- 「ちょうど N 回」「元のエラーそのもの」のように、**境界と同一性を検証する**
- Property-based は、例では思いつかない反例を見つける。性質を言葉にする訓練になる
- テストは**仕様書**。名前を読むだけで、何が保証されているか分かること
