// 課題02の受け入れテスト(型レベル)。ジェネリクスの型推論が意図どおり働くかを確認する。
import { expectTypeOf, test } from 'vitest';
import type { Page } from '@app/shared/page.js';
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
import type { Result } from '@app/shared/result.js';

test('ok / err は、使わない側の型が never になる', () => {
  // Result / Page が暫定の any のままだと、下の検証が「any と any が等しい」で空振りしてしまうので先に弾く
  expectTypeOf<Result<number, string>>().not.toBeAny();
  expectTypeOf<Page<number>>().not.toBeAny();
  expectTypeOf(ok(1)).toEqualTypeOf<Result<number, never>>();
  expectTypeOf(err('x')).toEqualTypeOf<Result<never, string>>();
});

test('Result は ok で絞り込める', () => {
  // Result / Page が暫定の any のままだと、下の検証が「any と any が等しい」で空振りしてしまうので先に弾く
  expectTypeOf<Result<number, string>>().not.toBeAny();
  expectTypeOf<Page<number>>().not.toBeAny();
  const r = null as unknown as Result<number, 'e'>;
  if (r.ok) {
    expectTypeOf(r.value).toEqualTypeOf<number>();
    // @ts-expect-error 成功側に error は無い
    void r.error;
  } else {
    expectTypeOf(r.error).toEqualTypeOf<'e'>();
    // @ts-expect-error 失敗側に value は無い
    void r.value;
  }
});

test('map / mapErr は片側の型だけを変える', () => {
  // Result / Page が暫定の any のままだと、下の検証が「any と any が等しい」で空振りしてしまうので先に弾く
  expectTypeOf<Result<number, string>>().not.toBeAny();
  expectTypeOf<Page<number>>().not.toBeAny();
  const r = null as unknown as Result<number, 'e'>;
  expectTypeOf(map(r, (n) => String(n))).toEqualTypeOf<Result<string, 'e'>>();
  expectTypeOf(mapErr(r, (e) => e.length)).toEqualTypeOf<Result<number, number>>();
});

test('flatMap はエラー型を合成する(E | F)', () => {
  // Result / Page が暫定の any のままだと、下の検証が「any と any が等しい」で空振りしてしまうので先に弾く
  expectTypeOf<Result<number, string>>().not.toBeAny();
  expectTypeOf<Page<number>>().not.toBeAny();
  const r = null as unknown as Result<number, 'a'>;
  const f = (n: number): Result<string, 404> => (n > 0 ? ok(String(n)) : err(404));
  expectTypeOf(flatMap(r, f)).toEqualTypeOf<Result<string, 'a' | 404>>();
});

test('unwrapOr / collect / fromPromise', () => {
  // Result / Page が暫定の any のままだと、下の検証が「any と any が等しい」で空振りしてしまうので先に弾く
  expectTypeOf<Result<number, string>>().not.toBeAny();
  expectTypeOf<Page<number>>().not.toBeAny();
  const r = null as unknown as Result<number, 'a'>;
  expectTypeOf(unwrapOr(r, 0)).toEqualTypeOf<number>();
  expectTypeOf(collect([r, r])).toEqualTypeOf<Result<number[], 'a'>>();
  expectTypeOf(fromPromise(Promise.resolve('s'))).toEqualTypeOf<Promise<Result<string, unknown>>>();
});

test('Page<T> と mapPage / sliceToPage', () => {
  // Result / Page が暫定の any のままだと、下の検証が「any と any が等しい」で空振りしてしまうので先に弾く
  expectTypeOf<Result<number, string>>().not.toBeAny();
  expectTypeOf<Page<number>>().not.toBeAny();
  const page = null as unknown as Page<number>;
  expectTypeOf(page.items).toEqualTypeOf<readonly number[]>();
  expectTypeOf(page.total).toEqualTypeOf<number>();
  expectTypeOf(mapPage(page, (n) => String(n))).toEqualTypeOf<Page<string>>();
  expectTypeOf(sliceToPage(['a'], 1, 0)).toEqualTypeOf<Page<string>>();
});
