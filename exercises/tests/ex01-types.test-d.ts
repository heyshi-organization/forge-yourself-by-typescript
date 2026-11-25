// 課題01の受け入れテスト(型レベル)。コンパイルが通れば合格。実行時には何も走らない。
import { expectTypeOf, test } from 'vitest';
import type {
  GitHubRepositoryInfo,
  OwnerType,
  RepositoryRequest,
  RepositorySpec,
  RequestError,
  RequestStatus,
  Visibility,
} from '@app/domain/request.js';

test('RequestStatus は4つの文字列リテラルのUnion型', () => {
  expectTypeOf<RequestStatus>().toEqualTypeOf<'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'>();
});

test('Visibility / OwnerType', () => {
  expectTypeOf<Visibility>().toEqualTypeOf<'public' | 'private'>();
  expectTypeOf<OwnerType>().toEqualTypeOf<'user' | 'organization'>();
});

test('RepositorySpec のフィールドの型', () => {
  expectTypeOf<RepositorySpec['owner']>().toEqualTypeOf<string>();
  expectTypeOf<RepositorySpec['ownerType']>().toEqualTypeOf<OwnerType>();
  expectTypeOf<RepositorySpec['name']>().toEqualTypeOf<string>();
  expectTypeOf<RepositorySpec['description']>().toEqualTypeOf<string | null>();
  expectTypeOf<RepositorySpec['visibility']>().toEqualTypeOf<Visibility>();
  expectTypeOf<RepositorySpec['autoInit']>().toEqualTypeOf<boolean>();
  expectTypeOf<RepositorySpec['topics']>().toEqualTypeOf<readonly string[]>();
});

test('RepositorySpec は readonly(後から書き換えられない)', () => {
  const spec = null as unknown as RepositorySpec;
  // @ts-expect-error readonly なので代入できない
  spec.owner = 'x';
});

test('GitHubRepositoryInfo / RequestError', () => {
  expectTypeOf<GitHubRepositoryInfo>().toHaveProperty('id').toEqualTypeOf<number>();
  expectTypeOf<GitHubRepositoryInfo>().toHaveProperty('fullName').toEqualTypeOf<string>();
  expectTypeOf<GitHubRepositoryInfo>().toHaveProperty('htmlUrl').toEqualTypeOf<string>();
  expectTypeOf<GitHubRepositoryInfo>().toHaveProperty('createdAt').toEqualTypeOf<string>();
  expectTypeOf<RequestError>().toHaveProperty('code').toEqualTypeOf<string>();
  expectTypeOf<RequestError>().toHaveProperty('message').toEqualTypeOf<string>();
});

test('RepositoryRequest の共通フィールド', () => {
  expectTypeOf<RepositoryRequest['id']>().toEqualTypeOf<string>();
  expectTypeOf<RepositoryRequest['status']>().toEqualTypeOf<RequestStatus>();
  expectTypeOf<RepositoryRequest['spec']>().toEqualTypeOf<RepositorySpec>();
  expectTypeOf<RepositoryRequest['idempotencyKey']>().toEqualTypeOf<string>();
  expectTypeOf<RepositoryRequest['requestHash']>().toEqualTypeOf<string>();
  expectTypeOf<RepositoryRequest['createdAt']>().toEqualTypeOf<string>();
  expectTypeOf<RepositoryRequest['updatedAt']>().toEqualTypeOf<string>();
});

test('status で絞り込む(Type Narrowing)と、状態ごとのフィールドが型安全に使える', () => {
  const r = null as unknown as RepositoryRequest;

  if (r.status === 'PROCESSING') {
    expectTypeOf(r.startedAt).toEqualTypeOf<string>();
  }
  if (r.status === 'SUCCEEDED') {
    expectTypeOf(r.repository).toEqualTypeOf<GitHubRepositoryInfo>();
    expectTypeOf(r.warnings).toEqualTypeOf<readonly string[]>();
    expectTypeOf(r.finishedAt).toEqualTypeOf<string>();
    expectTypeOf(r.startedAt).toEqualTypeOf<string>();
  }
  if (r.status === 'FAILED') {
    expectTypeOf(r.error).toEqualTypeOf<RequestError>();
    expectTypeOf(r.finishedAt).toEqualTypeOf<string>();
  }
  if (r.status === 'PENDING') {
    // @ts-expect-error PENDING はまだ GitHub に何もしていないので repository を持たない
    void r.repository;
    // @ts-expect-error PENDING は開始前なので startedAt を持たない
    void r.startedAt;
  }
});

test('絞り込む前は、状態固有のフィールドに触れない', () => {
  const r = null as unknown as RepositoryRequest;
  // @ts-expect-error status を確認する前は repository にアクセスできない
  void r.repository;
  // @ts-expect-error status を確認する前は error にアクセスできない
  void r.error;
});
