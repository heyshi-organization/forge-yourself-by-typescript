// 課題04の受け入れテスト(型レベル): スキーマから型を導出する(z.infer)。
import { expectTypeOf, test } from 'vitest';
import type { CreateRepositoryBody, ListQuery } from '@app/schemas/repository.js';

test('CreateRepositoryBody はスキーマから導出された型', () => {
  expectTypeOf<CreateRepositoryBody>().not.toBeAny();
  expectTypeOf<CreateRepositoryBody['owner']>().toEqualTypeOf<string>();
  expectTypeOf<CreateRepositoryBody['ownerType']>().toEqualTypeOf<'user' | 'organization'>();
  expectTypeOf<CreateRepositoryBody['name']>().toEqualTypeOf<string>();
  expectTypeOf<CreateRepositoryBody['visibility']>().toEqualTypeOf<'public' | 'private'>();
  // default() があるので、検証後の型では必須(undefined にならない)
  expectTypeOf<CreateRepositoryBody['autoInit']>().toEqualTypeOf<boolean>();
  expectTypeOf<CreateRepositoryBody['topics']>().toEqualTypeOf<string[]>();
  // optional() なので undefined になりうる
  expectTypeOf<CreateRepositoryBody['description']>().toEqualTypeOf<string | undefined>();
});

test('ListQuery', () => {
  expectTypeOf<ListQuery>().not.toBeAny();
  expectTypeOf<ListQuery['limit']>().toEqualTypeOf<number>();
  expectTypeOf<ListQuery['offset']>().toEqualTypeOf<number>();
  expectTypeOf<ListQuery['status']>().toEqualTypeOf<
    'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | undefined
  >();
});
