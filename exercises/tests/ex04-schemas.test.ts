import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createRepositoryBodySchema,
  idempotencyKeySchema,
  listQuerySchema,
  ownerSchema,
  repositoryNameSchema,
  toRepositorySpec,
} from '@app/schemas/repository.js';
import { FAKE_PAT, validBody } from '@test/helpers.js';

describe('repositoryNameSchema', () => {
  it.each(['a', 'my-repo', 'my_repo.v2', 'A1', '.github', 'a'.repeat(100)])('%s は有効', (v) => {
    expect(repositoryNameSchema.safeParse(v).success).toBe(true);
  });
  it.each([
    ['空文字', ''],
    ['101文字', 'a'.repeat(101)],
    ['スペース', 'my repo'],
    ['スラッシュ(パストラバーサル)', '../etc'],
    ['ドット1つ', '.'],
    ['ドット2つ', '..'],
    ['.git 終わり', 'repo.git'],
    ['.GIT 終わり', 'repo.GIT'],
    ['日本語', 'リポジトリ'],
    ['改行', 'a\nb'],
  ])('%s は無効', (_label, v) => {
    expect(repositoryNameSchema.safeParse(v).success).toBe(false);
  });
  it('property: 有効と判定された名前には、危険な文字が含まれない', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        if (repositoryNameSchema.safeParse(s).success) {
          expect(s).not.toMatch(/[/\\\s\0]/);
          expect(s).not.toBe('..');
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe('ownerSchema', () => {
  it.each(['a', 'octocat', 'my-org', 'a1', 'A'.repeat(39)])('%s は有効', (v) => {
    expect(ownerSchema.safeParse(v).success).toBe(true);
  });
  it.each(['', '-a', 'a-', 'a--b', 'a b', 'a/b', 'a'.repeat(40), 'a_b'])('"%s" は無効', (v) => {
    expect(ownerSchema.safeParse(v).success).toBe(false);
  });
});

describe('createRepositoryBodySchema', () => {
  it('最小の入力に既定値(autoInit=false, topics=[])が入る', () => {
    const body = createRepositoryBodySchema.parse(validBody);
    expect(body.autoInit).toBe(false);
    expect(body.topics).toEqual([]);
  });

  it('想定外のフィールドは拒否する(Mass Assignment対策)', () => {
    const r = createRepositoryBodySchema.safeParse({ ...validBody, isAdmin: true });
    expect(r.success).toBe(false);
  });

  it.each([
    ['必須項目の欠落', { ...validBody, name: undefined }],
    ['visibilityが不正', { ...validBody, visibility: 'internal' }],
    ['ownerTypeが不正', { ...validBody, ownerType: 'team' }],
    ['descriptionが351文字', { ...validBody, description: 'a'.repeat(351) }],
    ['descriptionに制御文字', { ...validBody, description: 'a\u0000b' }],
    ['topicsが21個', { ...validBody, topics: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ['topicsに大文字', { ...validBody, topics: ['Node'] }],
    ['topicsの重複', { ...validBody, topics: ['a', 'a'] }],
    ['autoInitが文字列', { ...validBody, autoInit: 'true' }],
    ['ボディがnull', null],
    ['ボディが配列', []],
  ])('%s は無効', (_label, input) => {
    expect(createRepositoryBodySchema.safeParse(input).success).toBe(false);
  });

  it('toRepositorySpec: description 未指定は null になる', () => {
    const spec = toRepositorySpec(createRepositoryBodySchema.parse(validBody));
    expect(spec).toEqual({
      owner: 'acme',
      ownerType: 'organization',
      name: 'demo-repo',
      description: null,
      visibility: 'private',
      autoInit: false,
      topics: [],
    });
  });

  it('エラーメッセージに入力値そのものが含まれない(秘密の反射を防ぐ)', () => {
    const secret = FAKE_PAT;
    const r = createRepositoryBodySchema.safeParse({ ...validBody, name: `bad name ${secret}` });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).not.toContain(secret);
  });
});

describe('idempotencyKeySchema / listQuerySchema', () => {
  it('Idempotency-Key', () => {
    expect(idempotencyKeySchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(
      true,
    );
    for (const bad of ['short', 'has space!', 'a'.repeat(129), 'a\nb12345678']) {
      expect(idempotencyKeySchema.safeParse(bad).success).toBe(false);
    }
  });
  it('listQuery: 文字列を数値に変換し、既定値を入れる', () => {
    expect(listQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(listQuerySchema.parse({ limit: '5', offset: '10', status: 'FAILED' })).toEqual({
      limit: 5,
      offset: 10,
      status: 'FAILED',
    });
  });
  it.each([
    { limit: '0' },
    { limit: '101' },
    { offset: '-1' },
    { limit: 'abc' },
    { status: 'DONE' },
    { x: '1' },
  ])('listQuery %j は無効', (q) => {
    expect(listQuerySchema.safeParse(q).success).toBe(false);
  });
});
