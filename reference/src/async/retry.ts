import { sleep as realSleep } from './sleep.js';

export interface RetryPolicy {
  /** 初回を含む最大試行回数。 */
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  /** 1回の待ち時間の上限。ヒントがこれを超える場合は「待たずに諦める」。 */
  readonly maxDelayMs: number;
}

export class RetryExhaustedError extends Error {
  constructor(
    readonly attempts: number,
    readonly lastError: unknown,
  ) {
    super(`${attempts}回試行しましたが成功しませんでした`);
    this.name = 'RetryExhaustedError';
    this.cause = lastError;
  }
}

export interface RetryOptions {
  readonly policy: RetryPolicy;
  /** このエラーは再試行してよいか。 */
  readonly isRetryable: (error: unknown) => boolean;
  /** サーバーが「◯ms後に再試行して」と指示している場合(Retry-After等)のミリ秒。 */
  readonly delayHintMs?: (error: unknown) => number | undefined;
  readonly sleep?: (ms: number) => Promise<void>;
  /** 0以上1未満の乱数。テストで固定するために注入できる。 */
  readonly random?: () => number;
  readonly onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

// @starter-begin ex03
/**
 * 指数バックオフ + Full Jitter。
 * failedAttempt は「失敗した試行の番号(1始まり)」。
 * 上限 = min(maxDelayMs, baseDelayMs * 2^(failedAttempt-1)) として、0〜上限 の範囲で乱数を掛ける。
 */
export function computeBackoffMs(
  failedAttempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
  return Math.floor(random() * ceiling);
}

/**
 * fn を最大 policy.maxAttempts 回まで実行する。
 * - 成功したらその値を返す。
 * - isRetryable が false のエラーは、そのまま(ラップせず)投げる。
 * - 待つべき時間(ヒントまたはバックオフ)が maxDelayMs を超える場合も、元のエラーをそのまま投げる。
 * - 試行回数を使い切ったら RetryExhaustedError を投げる(lastError に最後のエラーを持つ)。
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { policy, isRetryable } = options;
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (!isRetryable(error)) throw error;
      if (attempt >= policy.maxAttempts) throw new RetryExhaustedError(attempt, error);

      const hint = options.delayHintMs?.(error);
      const delayMs = hint ?? computeBackoffMs(attempt, policy, random);
      if (delayMs > policy.maxDelayMs) throw error;

      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
// @starter-else
//| // TODO(ex03): 指数バックオフ + Full Jitter の待ち時間を計算する
//| export function computeBackoffMs(
//|   _failedAttempt: number,
//|   _policy: RetryPolicy,
//|   _random: () => number = Math.random,
//| ): number {
//|   throw new NotImplementedError('03');
//| }
//|
//| // TODO(ex03): リトライ処理を実装する(仕様は docs/exercises/03-async-await.md を参照)
//| export async function retry<T>(
//|   _fn: (attempt: number) => Promise<T>,
//|   _options: RetryOptions,
//| ): Promise<T> {
//|   throw new NotImplementedError('03');
//| }
// @starter-end
