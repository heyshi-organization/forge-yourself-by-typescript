import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { RetryExhaustedError, computeBackoffMs, retry } from '@app/async/retry.js';
import type { RetryPolicy } from '@app/async/retry.js';

const policy: RetryPolicy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000 };

describe('computeBackoffMs', () => {
  it('指数的に増え、maxDelayMs で頭打ちになる(jitterなし: random=0.999..)', () => {
    const r = () => 0.999999;
    expect(computeBackoffMs(1, policy, r)).toBe(99);
    expect(computeBackoffMs(2, policy, r)).toBe(199);
    expect(computeBackoffMs(3, policy, r)).toBe(399);
    expect(computeBackoffMs(10, policy, r)).toBe(999);
  });
  it('random=0 なら 0ms(Full Jitter)', () => {
    expect(computeBackoffMs(3, policy, () => 0)).toBe(0);
  });
  it('property: 0 以上 min(max, base*2^(n-1)) 未満の整数', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 60000 }),
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        (attempt, base, max, rnd) => {
          const ms = computeBackoffMs(
            attempt,
            { maxAttempts: 5, baseDelayMs: base, maxDelayMs: max },
            () => rnd,
          );
          const ceiling = Math.min(max, base * 2 ** (attempt - 1));
          expect(Number.isInteger(ms)).toBe(true);
          expect(ms).toBeGreaterThanOrEqual(0);
          expect(ms).toBeLessThanOrEqual(ceiling);
        },
      ),
    );
  });
});

describe('retry', () => {
  const always = () => true;
  const never = () => false;
  const noSleep = (_ms: number) => Promise.resolve();

  it('成功すればそのまま返す(再試行しない)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await retry(fn, { policy, isRetryable: always, sleep: noSleep })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('再試行可能なエラーは回復するまで繰り返す', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');
    const sleep = vi.fn(noSleep);
    expect(await retry(fn, { policy, isRetryable: always, sleep, random: () => 0.5 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([50, 100]);
  });

  it('再試行不可のエラーは、ラップせず即座にそのまま投げる', async () => {
    const error = new Error('fatal');
    const fn = vi.fn().mockRejectedValue(error);
    await expect(retry(fn, { policy, isRetryable: never, sleep: noSleep })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('回数を使い切ったら RetryExhaustedError(最後のエラーを保持)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    const result = await retry(fn, { policy, isRetryable: always, sleep: noSleep }).catch(
      (e: unknown) => e,
    );
    expect(result).toBeInstanceOf(RetryExhaustedError);
    expect((result as RetryExhaustedError).attempts).toBe(4);
    expect(((result as RetryExhaustedError).lastError as Error).message).toBe('x');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('ヒント(Retry-After)があればバックオフの代わりにそれだけ待つ', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('rl')).mockResolvedValue('ok');
    const sleep = vi.fn(noSleep);
    await retry(fn, { policy, isRetryable: always, delayHintMs: () => 700, sleep });
    expect(sleep).toHaveBeenCalledWith(700);
  });

  it('待つべき時間が maxDelayMs を超えるなら、待たずに元のエラーを投げる', async () => {
    const error = new Error('rl');
    const fn = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn(noSleep);
    await expect(
      retry(fn, { policy, isRetryable: always, delayHintMs: () => 5000, sleep }),
    ).rejects.toBe(error);
    expect(sleep).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onRetry に試行番号と待ち時間が渡される', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('a')).mockResolvedValue(1);
    const onRetry = vi.fn();
    await retry(fn, { policy, isRetryable: always, sleep: noSleep, random: () => 0.5, onRetry });
    expect(onRetry).toHaveBeenCalledWith({
      attempt: 1,
      delayMs: 50,
      error: expect.any(Error) as unknown,
    });
  });

  it('property: 実行回数は maxAttempts を超えない', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8 }), async (maxAttempts) => {
        const fn = vi.fn().mockRejectedValue(new Error('x'));
        await retry(fn, {
          policy: { ...policy, maxAttempts },
          isRetryable: always,
          sleep: noSleep,
        }).catch(() => undefined);
        expect(fn).toHaveBeenCalledTimes(maxAttempts);
      }),
    );
  });
});
