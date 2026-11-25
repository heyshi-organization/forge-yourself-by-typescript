import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '@app/async/concurrency.js';
import { sleep } from '@app/async/sleep.js';
import { TimeoutError, withTimeout } from '@app/async/timeout.js';

describe('withTimeout', () => {
  it('時間内に終われば結果を返す', async () => {
    expect(await withTimeout(async () => 'ok', 100)).toBe('ok');
  });

  it('超過したら TimeoutError で reject し、signal を abort する', async () => {
    let received: AbortSignal | undefined;
    const promise = withTimeout(
      (signal) => {
        received = signal;
        return new Promise<never>(() => {}); // 永遠に終わらない
      },
      30,
      'テスト処理',
    );
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await expect(promise).rejects.toThrow('テスト処理');
    expect(received?.aborted).toBe(true);
    expect(received?.reason).toBeInstanceOf(TimeoutError);
  });

  it('fn が先に失敗したら、そのエラーをそのまま投げる', async () => {
    const error = new Error('boom');
    await expect(withTimeout(() => Promise.reject(error), 100)).rejects.toBe(error);
  });

  it('タイムアウト後に fn が失敗しても unhandled rejection にならない', async () => {
    const unhandled: unknown[] = [];
    const handler = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', handler);
    await withTimeout(
      () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('late')), 40)),
      10,
    ).catch(() => undefined);
    await sleep(80);
    process.off('unhandledRejection', handler);
    expect(unhandled).toEqual([]);
  });
});

describe('sleep', () => {
  it('指定時間待つ', async () => {
    const start = Date.now();
    await sleep(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
  it('signal で中断できる', async () => {
    const controller = new AbortController();
    const p = sleep(10_000, controller.signal);
    controller.abort(new Error('stop'));
    await expect(p).rejects.toThrow('stop');
  });
  it('すでに abort 済みなら即 reject', async () => {
    await expect(sleep(10, AbortSignal.abort(new Error('done')))).rejects.toThrow('done');
  });
});

describe('mapWithConcurrency', () => {
  it('結果を入力と同じ順序で返す', async () => {
    const out = await mapWithConcurrency([30, 5, 15], 2, async (ms, i) => {
      await sleep(ms);
      return `${i}:${ms}`;
    });
    expect(out).toEqual(['0:30', '1:5', '2:15']);
  });

  it('同時実行数が limit を超えない', async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await sleep(5);
        running -= 1;
      },
    );
    expect(peak).toBe(3);
  });

  it('1つ失敗したら reject し、以降の要素は開始しない', async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(started).toEqual([1, 2]);
  });

  it('空配列は空配列、不正な limit は RangeError', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
    await expect(mapWithConcurrency([1], 0, async () => 1)).rejects.toThrow(RangeError);
  });
});
