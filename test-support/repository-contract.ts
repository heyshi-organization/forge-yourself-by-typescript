import { beforeEach, describe, expect, it } from 'vitest';
import { InFlightConflictError } from '@app/db/request-repository.js';
import type { NewRequest, RequestRepository } from '@app/db/request-repository.js';
import { InvalidTransitionError } from '@app/domain/state-machine.js';
import { makeSpec } from '@test/helpers.js';

const repoInfo = {
  id: 7,
  fullName: 'acme/demo-repo',
  htmlUrl: 'https://github.com/acme/demo-repo',
  createdAt: '2026-01-01T00:00:00Z',
};

function newRequest(n: number, overrides: Partial<NewRequest> = {}): NewRequest {
  return {
    id: `id-${n}`,
    idempotencyKey: `key-${String(n).padStart(8, '0')}`,
    requestHash: `hash-${n}`,
    spec: makeSpec({ name: `repo-${n}` }),
    now: `2026-01-01T00:00:0${n}.000Z`,
    ...overrides,
  };
}

/**
 * RequestRepository が守るべき振る舞い(契約)。
 * インメモリ実装(ex06)とSQLite実装(ex09)が、同じテストで同じ振る舞いを保証する。
 */
export function describeRequestRepositoryContract(
  name: string,
  factory: () => RequestRepository,
): void {
  describe(`RequestRepository 契約: ${name}`, () => {
    let repo: RequestRepository;
    beforeEach(() => {
      repo = factory();
    });

    it('createOrGet: 新規は PENDING で保存される', async () => {
      const { request, created } = await repo.createOrGet(newRequest(1));
      expect(created).toBe(true);
      expect(request).toMatchObject({
        id: 'id-1',
        status: 'PENDING',
        createdAt: '2026-01-01T00:00:01.000Z',
      });
      expect(request.spec).toEqual(makeSpec({ name: 'repo-1' }));
      expect(await repo.findById('id-1')).toEqual(request);
    });

    it('createOrGet: 同じ idempotencyKey なら新規作成せず既存を返す', async () => {
      const first = await repo.createOrGet(newRequest(1));
      const second = await repo.createOrGet(newRequest(1, { id: 'other-id' }));
      expect(second.created).toBe(false);
      expect(second.request.id).toBe(first.request.id);
      expect((await repo.list({ limit: 10, offset: 0 })).total).toBe(1);
    });

    it('createOrGet: 同じリポジトリの処理中要求があれば InFlightConflictError(大文字小文字は区別しない)', async () => {
      await repo.createOrGet(newRequest(1));
      await expect(
        repo.createOrGet(newRequest(2, { spec: makeSpec({ owner: 'ACME', name: 'REPO-1' }) })),
      ).rejects.toBeInstanceOf(InFlightConflictError);
    });

    it('createOrGet: 前の要求が終端状態なら、同じリポジトリの新しい要求を作れる', async () => {
      await repo.createOrGet(newRequest(1));
      await repo.transition('id-1', 'PENDING', {
        to: 'PROCESSING',
        now: '2026-01-01T00:01:00.000Z',
      });
      await repo.transition('id-1', 'PROCESSING', {
        to: 'FAILED',
        now: '2026-01-01T00:02:00.000Z',
        error: { code: 'X', message: 'm' },
      });
      const retry = await repo.createOrGet(newRequest(2, { spec: makeSpec({ name: 'repo-1' }) }));
      expect(retry.created).toBe(true);
    });

    it('findById: 無ければ null', async () => {
      expect(await repo.findById('nope')).toBeNull();
    });

    it('transition: PENDING → PROCESSING → SUCCEEDED と、各状態のフィールド', async () => {
      await repo.createOrGet(newRequest(1));
      const processing = await repo.transition('id-1', 'PENDING', {
        to: 'PROCESSING',
        now: '2026-01-01T00:01:00.000Z',
      });
      expect(processing).toMatchObject({
        status: 'PROCESSING',
        startedAt: '2026-01-01T00:01:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z',
      });

      const done = await repo.transition('id-1', 'PROCESSING', {
        to: 'SUCCEEDED',
        now: '2026-01-01T00:02:00.000Z',
        repository: repoInfo,
        warnings: ['TOPICS_NOT_APPLIED'],
      });
      expect(done).toMatchObject({
        status: 'SUCCEEDED',
        startedAt: '2026-01-01T00:01:00.000Z',
        finishedAt: '2026-01-01T00:02:00.000Z',
        repository: repoInfo,
        warnings: ['TOPICS_NOT_APPLIED'],
      });
      expect(await repo.findById('id-1')).toEqual(done);
    });

    it('transition: FAILED の保存', async () => {
      await repo.createOrGet(newRequest(1));
      await repo.transition('id-1', 'PENDING', {
        to: 'PROCESSING',
        now: '2026-01-01T00:01:00.000Z',
      });
      const failed = await repo.transition('id-1', 'PROCESSING', {
        to: 'FAILED',
        now: '2026-01-01T00:02:00.000Z',
        error: { code: 'GITHUB_TIMEOUT', message: 'timeout' },
      });
      expect(failed).toMatchObject({
        status: 'FAILED',
        error: { code: 'GITHUB_TIMEOUT', message: 'timeout' },
      });
    });

    it('transition: 現在の状態が from と違えば何もせず null(二重実行の防止)', async () => {
      await repo.createOrGet(newRequest(1));
      expect(
        await repo.transition('id-1', 'PROCESSING', {
          to: 'FAILED',
          now: 'x',
          error: { code: 'a', message: 'b' },
        }),
      ).toBeNull();
      await repo.transition('id-1', 'PENDING', {
        to: 'PROCESSING',
        now: '2026-01-01T00:01:00.000Z',
      });
      // 2回目の PENDING→PROCESSING は負ける
      expect(
        await repo.transition('id-1', 'PENDING', {
          to: 'PROCESSING',
          now: '2026-01-01T00:01:30.000Z',
        }),
      ).toBeNull();
      expect(await repo.transition('nope', 'PENDING', { to: 'PROCESSING', now: 'x' })).toBeNull();
    });

    it('transition: 許されない遷移は InvalidTransitionError', async () => {
      await repo.createOrGet(newRequest(1));
      await expect(
        repo.transition('id-1', 'PENDING', {
          to: 'SUCCEEDED',
          now: 'x',
          repository: repoInfo,
          warnings: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTransitionError);
    });

    it('list: 新しい順・ページング・status絞り込み・total', async () => {
      for (const n of [1, 2, 3, 4]) await repo.createOrGet(newRequest(n));
      await repo.transition('id-2', 'PENDING', {
        to: 'PROCESSING',
        now: '2026-01-01T00:05:00.000Z',
      });

      const page1 = await repo.list({ limit: 2, offset: 0 });
      expect(page1.items.map((r) => r.id)).toEqual(['id-4', 'id-3']);
      expect(page1).toMatchObject({ total: 4, limit: 2, offset: 0 });
      expect((await repo.list({ limit: 2, offset: 2 })).items.map((r) => r.id)).toEqual([
        'id-2',
        'id-1',
      ]);

      const processing = await repo.list({ limit: 10, offset: 0, status: 'PROCESSING' });
      expect(processing.items.map((r) => r.id)).toEqual(['id-2']);
      expect(processing.total).toBe(1);
      expect((await repo.list({ limit: 10, offset: 0, status: 'FAILED' })).total).toBe(0);
    });

    it('findStale: 指定の状態で、updatedAt が閾値より古いものだけ', async () => {
      await repo.createOrGet(newRequest(1)); // PENDING, updated 00:00:01
      await repo.createOrGet(newRequest(2));
      await repo.transition('id-2', 'PENDING', {
        to: 'PROCESSING',
        now: '2026-01-01T00:10:00.000Z',
      });
      await repo.createOrGet(newRequest(3));
      await repo.transition('id-3', 'PENDING', {
        to: 'PROCESSING',
        now: '2026-01-01T00:00:05.000Z',
      });

      const stale = await repo.findStale(['PENDING', 'PROCESSING'], '2026-01-01T00:05:00.000Z');
      expect(stale.map((r) => r.id).sort()).toEqual(['id-1', 'id-3']);
      expect(await repo.findStale([], 'z')).toEqual([]);
      expect(
        (await repo.findStale(['PROCESSING'], '2026-01-01T00:05:00.000Z')).map((r) => r.id),
      ).toEqual(['id-3']);
    });
  });
}
