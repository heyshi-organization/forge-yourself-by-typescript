import { sleep as realSleep } from './sleep.js';
import { NotImplementedError } from '../shared/not-implemented.js';

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

// TODO(ex03): 指数バックオフ + Full Jitter の待ち時間を計算する
export function computeBackoffMs(
  _failedAttempt: number,
  _policy: RetryPolicy,
  _random: () => number = Math.random,
): number {
  throw new NotImplementedError('03');
}

// TODO(ex03): リトライ処理を実装する(仕様は docs/exercises/03-async-await.md を参照)
export async function retry<T>(
  _fn: (attempt: number) => Promise<T>,
  _options: RetryOptions,
): Promise<T> {
  throw new NotImplementedError('03');
}
