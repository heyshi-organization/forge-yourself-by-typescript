# 課題03: 非同期処理(タイムアウト・リトライ・並行制御)

**週3** / 実装場所: `starter/src/async/timeout.ts`, `retry.ts`, `concurrency.ts`

## 1. 課題の目的

GitHub のような外部APIを呼ぶとき、必ず必要になる3つの部品を自分で作る: **タイムアウト**(いつまでも待たない)・**リトライ**(一時的な失敗は再試行)・**並行数の制御**(同時に走らせすぎない)。
これらは外部ライブラリでも提供されているが、**仕組みを理解して**、後の課題(08・10)で正しく使えるようにする。

## 2. 学習する概念

Promise / `async` `await` / イベントループ(マイクロタスクとタイマー) / `Promise.race` `Promise.all` / `AbortController` `AbortSignal` / `try ... finally` / エラーの伝播 / 指数バックオフ + Jitter

## 3. 背景知識

**イベントループ**: Node.js は1つのスレッドで、「待ち行列」の処理を順に実行する。`await` は、結果が出るまで**その関数を中断し、他の処理に実行を譲る**。
だから `await` の前後で、他のリクエストの処理が割り込む(課題10の「確認してから更新」が危険な理由)。

```ts
console.log(1);
setTimeout(() => console.log(2), 0); // タイマー(次のループ)
Promise.resolve().then(() => console.log(3)); // マイクロタスク(今の処理が終わった直後)
console.log(4);
// 出力順を予想してから実行してみよう → 1, 4, 3, 2
```

**タイムアウト**: JavaScript の Promise は、外から「やめろ」と言えない。`AbortController` で**中断の合図(signal)**を作り、通信側(`fetch` 等)がそれを見て中断する。
`Promise.race([本処理, タイムアウトを表すPromise])` で、先に決まった方の結果を使う。**タイマーは終わったら必ず `clearTimeout`**(残ると、Node.js プロセスが終了できない)。

**リトライの要点**

- 再試行してよいのは「一時的な失敗」だけ(何度やっても同じ失敗を繰り返さない)
- 待ち時間は**指数的に**増やす(0.5s → 1s → 2s …)。上限を設ける
- **Jitter**(乱数)を混ぜる。多数のクライアントが同時に失敗すると、同じタイミングで再試行して**再び一斉に負荷をかける**(thundering herd)のを避ける
  - Full Jitter: `待ち時間 = random(0, 上限)`。上限 = `min(maxDelay, base × 2^(失敗回数-1))`
- 回数の上限を必ず設ける
- サーバーが「◯秒後に」と指示(`Retry-After`)したら、それに従う。ただし待ち時間が長すぎるなら諦める

## 4. 実装する機能

### `async/timeout.ts` — `withTimeout(fn, ms, label?)`

```ts
withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, label = 'operation'): Promise<T>
```

- `fn` に `AbortSignal` を渡して実行する。`ms` 以内に終われば、その結果(またはエラー)をそのまま返す(投げる)
- 超過したら: ① `signal` を `abort`(**reason に TimeoutError** を渡す)② `TimeoutError`(用意済み。`label` がメッセージに入る)で reject
- 結果が出たら**タイマーを必ず片付ける**
- タイムアウト後に `fn` が失敗しても、**unhandled rejection を起こさない**

### `async/retry.ts`

```ts
computeBackoffMs(failedAttempt: number, policy: RetryPolicy, random = Math.random): number
retry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T>
```

`RetryPolicy` / `RetryOptions` / `RetryExhaustedError` は用意済み(読むこと)。

`computeBackoffMs`: `failedAttempt` は失敗した試行の番号(**1始まり**)。`ceiling = min(maxDelayMs, baseDelayMs × 2^(failedAttempt-1))` として、`floor(random() × ceiling)` を返す。

`retry` の仕様:

1. `fn(attempt)` を最大 `policy.maxAttempts` 回まで実行する(`attempt` は1始まり)。成功したらその値を返す
2. 失敗したとき `isRetryable(error)` が **false** → そのエラーを**ラップせず、そのまま** throw(再試行しない)
3. 最後の試行も失敗(回数を使い切った)→ `RetryExhaustedError(attempt, 最後のエラー)` を throw(ここで**待たない**)
4. 再試行するとき、待ち時間は `delayHintMs?.(error)` があればそれ、なければ `computeBackoffMs(attempt, policy, random)`
5. 待ち時間が `policy.maxDelayMs` を**超える**なら、待たずに**元のエラーをそのまま** throw(長く待つくらいなら諦める)
6. 待つ前に `onRetry?.({ attempt, delayMs, error })` を呼び、`sleep(delayMs)`(`options.sleep ?? sleep`)で待つ

### `async/concurrency.ts` — `mapWithConcurrency(items, limit, fn)`

- `items` を最大 `limit` 個ずつ**並行に**処理し、結果を**入力と同じ順序**で返す
- `limit` が1以上の整数でなければ `RangeError`
- どれか1つでも失敗したら全体も失敗し、**以降の要素は開始しない**

## 5. 実装対象ファイル

`starter/src/async/timeout.ts`(`withTimeout`)/ `retry.ts`(`computeBackoffMs`・`retry`)/ `concurrency.ts`(`mapWithConcurrency`)。`sleep.ts` は用意済み。

## 6. 受け入れ条件

- [ ] 時間内なら結果を返し、超過すれば `TimeoutError` + `signal.aborted`(reason は `TimeoutError`)
- [ ] 成功/失敗どちらでもタイマーが片付く。タイムアウト後に失敗しても unhandled rejection にならない
- [ ] バックオフは指数的に増え、`maxDelayMs` で頭打ち。`random=0` なら 0ms。結果は常に整数で `0 ≤ 結果 ≤ 上限`
- [ ] `retry`: 成功したら再試行しない / 再試行可能なら回復まで繰り返す / 再試行不可はそのまま throw / 使い切ったら `RetryExhaustedError` / ヒント通りに待つ / 長すぎるヒントは待たずに諦める / `onRetry` が呼ばれる / 実行回数は `maxAttempts` を超えない
- [ ] `mapWithConcurrency`: 順序が保たれる / 同時実行数が `limit` を超えない / 失敗で止まる / 空配列・不正な `limit`

## 7. テスト方法

```bash
npm run exercise -- 03     # ex03-retry.test.ts / ex03-timeout-concurrency.test.ts(Property-based 含む)
```

## 8. 段階的なヒント

<details><summary>ヒント1: withTimeout</summary>

`new AbortController()` を作り、`Promise.race([fn(controller.signal), timeoutPromise])`。`timeoutPromise` は `setTimeout` で `reject` する Promise。
`try { return await Promise.race(...) } finally { clearTimeout(timer) }`。タイムアウトの `setTimeout` の中で、`controller.abort(error)` と `reject(error)` の両方を行う。

</details>

<details><summary>ヒント2: retry</summary>

`for (let attempt = 1; ; attempt += 1)` の中で `try { return await fn(attempt) } catch (error) { ... }`。
`catch` の中の判定順: ① `!isRetryable` → throw ② `attempt >= maxAttempts` → `RetryExhaustedError` ③ 待ち時間を決める ④ 長すぎたら throw ⑤ `onRetry` → `sleep`。

</details>

<details><summary>ヒント3: mapWithConcurrency</summary>

`results = new Array(items.length)` と共有カウンタ `next = 0`。`worker` 関数が `while (next < items.length)` で `const i = next++` してから処理し `results[i]` に書く。
`Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))`。失敗したら `failed = true` にして、他のワーカーが新しい要素を取らないようにする。
(JavaScript は1スレッドなので、`next++` の取り出しは `await` をまたがない限り安全)

</details>

## 9. 発展課題

1. `AbortSignal.any([a, b])` で「外部からの中断」と「タイムアウト」を合成する `withTimeout`
2. `retry` に**総時間の上限(deadline)**を追加する
3. `mapWithConcurrency` の `allSettled` 版(失敗しても全部実行し、成功/失敗を返す)
4. `vi.useFakeTimers()` を使って、実際に待たずに `retry` をテストする(課題07の予習)

## 10. 完了後に理解しておくべきこと

- `await` で処理が中断され、他の処理が割り込めること(イベントループ)
- Promise は外から止められない。**中断は `AbortSignal` の協力で成り立つ**
- 「再試行してよい失敗」と「してはいけない失敗」を区別する理由、バックオフ+Jitter の理由
- タイマーの後始末、unhandled rejection に注意すること
- **POST のような非冪等な操作を、タイムアウト後に再試行する危険**(課題08・10へ)
