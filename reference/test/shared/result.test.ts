import { describe, expect, it } from 'vitest';
import { mapPage, sliceToPage } from '@app/shared/page.js';
import {
  collect,
  err,
  flatMap,
  fromPromise,
  map,
  mapErr,
  ok,
  unwrapOr,
} from '@app/shared/result.js';

describe('Result', () => {
  it('ok / err', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('e')).toEqual({ ok: false, error: 'e' });
  });
  it('map は成功値だけ変換する', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err('e'), (n: number) => n * 2)).toEqual(err('e'));
  });
  it('mapErr は失敗だけ変換する', () => {
    expect(mapErr(err('e'), (e) => e.toUpperCase())).toEqual(err('E'));
    expect(mapErr(ok(1), (e: string) => e)).toEqual(ok(1));
  });
  it('flatMap は連鎖し、最初の失敗で止まる', () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err('odd'));
    expect(flatMap(ok(4), half)).toEqual(ok(2));
    expect(flatMap(ok(3), half)).toEqual(err('odd'));
    expect(flatMap(err('x'), half)).toEqual(err('x'));
  });
  it('unwrapOr', () => {
    expect(unwrapOr(ok(1), 0)).toBe(1);
    expect(unwrapOr(err('e'), 0)).toBe(0);
  });
  it('collect', () => {
    expect(collect([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(collect([ok(1), err('a'), err('b')])).toEqual(err('a'));
    expect(collect([])).toEqual(ok([]));
  });
  it('fromPromise は例外を Err にする', async () => {
    expect(await fromPromise(Promise.resolve(1))).toEqual(ok(1));
    const boom = new Error('boom');
    expect(await fromPromise(Promise.reject(boom))).toEqual(err(boom));
  });
});

describe('Page', () => {
  it('sliceToPage', () => {
    expect(sliceToPage([1, 2, 3, 4, 5], 2, 2)).toEqual({
      items: [3, 4],
      total: 5,
      limit: 2,
      offset: 2,
    });
    expect(sliceToPage([1], 10, 5).items).toEqual([]);
  });
  it('mapPage は型だけ変えてページ情報を保つ', () => {
    expect(mapPage({ items: [1, 2], total: 9, limit: 2, offset: 0 }, String)).toEqual({
      items: ['1', '2'],
      total: 9,
      limit: 2,
      offset: 0,
    });
  });
});
