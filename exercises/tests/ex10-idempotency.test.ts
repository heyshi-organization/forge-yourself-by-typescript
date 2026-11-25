import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRequestRepository } from '@app/db/in-memory-request-repository.js';
import { PersistenceError } from '@app/db/request-repository.js';
import { AppError } from '@app/errors/app-error.js';
import { FakeGitHubClient } from '@app/github/fake-github-client.js';
import { ResilientProvisioner } from '@app/provisioning/resilient-provisioner.js';
import type { RepositoryProvisioner } from '@app/provisioning/types.js';
import { ProvisioningService } from '@app/services/provisioning-service.js';
import { ManualClock } from '@app/shared/clock.js';
import { SequentialIds } from '@app/shared/ids.js';
import { err } from '@app/shared/result.js';
import { FaultyRepository } from '@test/faulty-repository.js';
import { captureLogs, httpError, makeSpec } from '@test/helpers.js';

const LEASE = 60_000;
let clock: ManualClock;
let github: FakeGitHubClient;
let repo: InMemoryRequestRepository;
let faulty: FaultyRepository;
let logs: ReturnType<typeof captureLogs>;

function makeService(provisioner?: RepositoryProvisioner) {
  return new ProvisioningService({
    requests: faulty,
    provisioner:
      provisioner ??
      new ResilientProvisioner({
        github,
        timeoutMs: 100,
        retryPolicy: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 10 },
        sleep: async () => {},
      }),
    clock,
    ids: new SequentialIds('req'),
    logger: logs.logger,
    leaseMs: LEASE,
  });
}

beforeEach(() => {
  clock = new ManualClock();
  github = new FakeGitHubClient({ clock, login: 'acme-user' });
  repo = new InMemoryRequestRepository();
  faulty = new FaultyRepository(repo);
  logs = captureLogs();
});

const key = (n: number) => `key-${String(n).padStart(8, '0')}`;

describe('submit: 基本', () => {
  it('新規の要求を処理して SUCCEEDED にする', async () => {
    const { request, replayed } = await makeService().submit({
      spec: makeSpec(),
      idempotencyKey: key(1),
    });
    expect(replayed).toBe(false);
    expect(request).toMatchObject({
      id: 'req-1',
      status: 'SUCCEEDED',
      repository: { fullName: 'acme/demo-repo' },
    });
    expect(github.countCalls('createRepository')).toBe(1);
  });

  it('GitHub の失敗は FAILED として保存され、submit 自体は例外にならない', async () => {
    github.enqueue('createRepository', { type: 'fail', error: httpError(401) });
    const { request } = await makeService().submit({ spec: makeSpec(), idempotencyKey: key(1) });
    expect(request).toMatchObject({ status: 'FAILED', error: { code: 'GITHUB_AUTH_FAILED' } });
    expect((await repo.findById('req-1'))?.status).toBe('FAILED');
  });

  it('プロビジョナーが想定外の例外を投げても、PROCESSING のまま残らず FAILED(INTERNAL_ERROR)になる', async () => {
    const broken: RepositoryProvisioner = {
      provision: () => Promise.reject(new TypeError('bug')),
      reconcile: () => Promise.reject(new TypeError('bug')),
    };
    const { request } = await makeService(broken).submit({
      spec: makeSpec(),
      idempotencyKey: key(1),
    });
    expect(request).toMatchObject({ status: 'FAILED', error: { code: 'INTERNAL_ERROR' } });
    expect(logs.lines.some((l) => l.level === 50)).toBe(true); // error レベルで記録
  });
});

describe('submit: 冪等性', () => {
  it('同じキー・同じ内容の再送は、GitHub を呼ばず前回の結果を返す', async () => {
    const service = makeService();
    const first = await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    const second = await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    expect(second.replayed).toBe(true);
    expect(second.request).toEqual(first.request);
    expect(github.countCalls('createRepository')).toBe(1);
  });

  it('topics の並び順だけが違う再送は「同じ内容」', async () => {
    const service = makeService();
    await service.submit({ spec: makeSpec({ topics: ['a', 'b'] }), idempotencyKey: key(1) });
    const again = await service.submit({
      spec: makeSpec({ topics: ['b', 'a'] }),
      idempotencyKey: key(1),
    });
    expect(again.replayed).toBe(true);
  });

  it('同じキーで内容が違えば IDEMPOTENCY_KEY_REUSED', async () => {
    const service = makeService();
    await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    await expect(
      service.submit({ spec: makeSpec({ visibility: 'public' }), idempotencyKey: key(1) }),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('失敗(FAILED)も再送では再実行せず、同じ失敗を返す', async () => {
    github.enqueue('createRepository', {
      type: 'fail',
      error: httpError(403, {}, {}, 'Resource not accessible'),
    });
    const service = makeService();
    await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    const again = await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    expect(again).toMatchObject({
      replayed: true,
      request: { status: 'FAILED', error: { code: 'GITHUB_PERMISSION_DENIED' } },
    });
    expect(github.countCalls('createRepository')).toBe(1);
  });

  it('失敗した要求の後、新しいキーなら同じリポジトリで再挑戦できる', async () => {
    github.enqueue('createRepository', { type: 'fail', error: httpError(401) });
    const service = makeService();
    await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    const retried = await service.submit({ spec: makeSpec(), idempotencyKey: key(2) });
    expect(retried.request.status).toBe('SUCCEEDED');
  });

  it('同じキーの同時リクエスト: GitHub は1回だけ呼ばれ、片方は「処理中」', async () => {
    github = new FakeGitHubClient({ clock, latencyMs: 20 });
    const service = makeService();
    const results = await Promise.allSettled([
      service.submit({ spec: makeSpec(), idempotencyKey: key(1) }),
      service.submit({ spec: makeSpec(), idempotencyKey: key(1) }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'REQUEST_IN_PROGRESS' });
    expect(github.countCalls('createRepository')).toBe(1);
  });

  it('別のキーで同じリポジトリを同時に作ろうとすると REPOSITORY_REQUEST_IN_PROGRESS', async () => {
    github = new FakeGitHubClient({ clock, latencyMs: 20 });
    const service = makeService();
    const results = await Promise.allSettled([
      service.submit({ spec: makeSpec(), idempotencyKey: key(1) }),
      service.submit({ spec: makeSpec(), idempotencyKey: key(2) }),
    ]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'REPOSITORY_REQUEST_IN_PROGRESS' });
    expect(github.countCalls('createRepository')).toBe(1);
  });
});

describe('障害: GitHubでは作成できたが、DBに結果を保存できなかった', () => {
  it('要求は PROCESSING のまま残り、リース切れ後の再送で reconcile され、重複作成されない', async () => {
    const service = makeService();
    faulty.failNext('transition', new PersistenceError('disk full'), 'SUCCEEDED');

    await expect(
      service.submit({ spec: makeSpec(), idempotencyKey: key(1) }),
    ).rejects.toBeInstanceOf(PersistenceError);
    expect((await repo.findById('req-1'))?.status).toBe('PROCESSING');
    expect(github.repos.size).toBe(1); // GitHub側には作られている
    expect(logs.lines.some((l) => l.githubRepository === 'acme/demo-repo')).toBe(true); // 手がかりをログに残す

    // リース内の再送は「処理中」(別の処理が動いている可能性があるため)
    await expect(
      service.submit({ spec: makeSpec(), idempotencyKey: key(1) }),
    ).rejects.toMatchObject({
      code: 'REQUEST_IN_PROGRESS',
    });

    // リースが切れた後の再送で、GitHubを確認して SUCCEEDED にする
    clock.advance(LEASE + 1);
    const recovered = await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    expect(recovered).toMatchObject({ replayed: true, request: { status: 'SUCCEEDED' } });
    expect(github.countCalls('createRepository')).toBe(1);
  });

  it('FAILED の保存に失敗した場合も PROCESSING のまま残る(例外は呼び出し元へ)', async () => {
    github.enqueue('createRepository', { type: 'fail', error: httpError(401) });
    faulty.failNext('transition', new PersistenceError('io'), 'FAILED');
    await expect(
      makeService().submit({ spec: makeSpec(), idempotencyKey: key(1) }),
    ).rejects.toBeInstanceOf(PersistenceError);
    expect((await repo.findById('req-1'))?.status).toBe('PROCESSING');
  });

  it('最初の保存(createOrGet)の失敗は例外になり、GitHubは呼ばれない', async () => {
    faulty.failNext('createOrGet');
    await expect(
      makeService().submit({ spec: makeSpec(), idempotencyKey: key(1) }),
    ).rejects.toBeInstanceOf(PersistenceError);
    expect(github.countCalls('createRepository')).toBe(0);
  });
});

describe('復旧(recoverStale)', () => {
  const seed = async (id: number, state: 'PENDING' | 'PROCESSING') => {
    await repo.createOrGet({
      id: `req-${id}`,
      idempotencyKey: key(id),
      requestHash: 'unused',
      spec: makeSpec({ name: `repo-${id}` }),
      now: clock.now().toISOString(),
    });
    if (state === 'PROCESSING')
      await repo.transition(`req-${id}`, 'PENDING', {
        to: 'PROCESSING',
        now: clock.now().toISOString(),
      });
  };

  it('リース内の要求には触れない', async () => {
    await seed(1, 'PROCESSING');
    clock.advance(LEASE - 1);
    expect(await makeService().recoverStale()).toEqual({ checked: 0, outcomes: [] });
  });

  it('PENDING のまま残った要求は、通常どおり処理される', async () => {
    await seed(1, 'PENDING');
    clock.advance(LEASE + 1);
    const report = await makeService().recoverStale();
    expect(report.outcomes).toEqual([{ id: 'req-1', status: 'SUCCEEDED' }]);
    expect(github.repos.has('acme/repo-1')).toBe(true);
  });

  it('PROCESSING で、GitHub に作成済みなら SUCCEEDED', async () => {
    await seed(1, 'PROCESSING');
    await github.createRepository(makeSpec({ name: 'repo-1' }));
    clock.advance(LEASE + 1);
    expect((await makeService().recoverStale()).outcomes).toEqual([
      { id: 'req-1', status: 'SUCCEEDED' },
    ]);
    expect(github.countCalls('createRepository')).toBe(1);
  });

  it('PROCESSING で、GitHub に無ければ FAILED(INTERRUPTED)。自動で再作成はしない', async () => {
    await seed(1, 'PROCESSING');
    clock.advance(LEASE + 1);
    await makeService().recoverStale();
    expect(await repo.findById('req-1')).toMatchObject({
      status: 'FAILED',
      error: { code: 'INTERRUPTED' },
    });
    expect(github.countCalls('createRepository')).toBe(0);
  });

  it('複数をまとめて復旧し、1件の失敗で他を止めない', async () => {
    await seed(1, 'PROCESSING');
    await seed(2, 'PROCESSING');
    clock.advance(LEASE + 1);
    faulty.failNext('transition', new PersistenceError('io'), 'FAILED'); // 先に処理された1件の保存だけ失敗
    const report = await makeService().recoverStale(1);
    expect(report.checked).toBe(2);
    expect(report.outcomes.map((o) => o.status).sort()).toEqual(['ERROR', 'FAILED']);
  });

  it('同じ要求を2か所が同時に復旧しても、結果は1つに収束する', async () => {
    await seed(1, 'PROCESSING');
    await github.createRepository(makeSpec({ name: 'repo-1' }));
    clock.advance(LEASE + 1);
    const service = makeService();
    const stale = (await repo.findById('req-1'))!;
    const [a, b] = await Promise.all([service.recover(stale), service.recover(stale)]);
    expect(a.status).toBe('SUCCEEDED');
    expect(b.status).toBe('SUCCEEDED');
  });

  it('終端状態の要求の recover は何もしない', async () => {
    const service = makeService();
    const { request } = await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    expect(await service.recover(request)).toBe(request);
  });
});

describe('get / list', () => {
  it('get: 存在しなければ NOT_FOUND', async () => {
    await expect(makeService().get('nope')).rejects.toEqual(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    await expect(makeService().get('nope')).rejects.toBeInstanceOf(AppError);
  });
  it('get / list: 保存された要求を返す', async () => {
    const service = makeService();
    await service.submit({ spec: makeSpec(), idempotencyKey: key(1) });
    expect((await service.get('req-1')).status).toBe('SUCCEEDED');
    expect((await service.list({ limit: 10, offset: 0 })).total).toBe(1);
  });
  it('プロビジョナーがエラー結果を返したら FAILED(OWNER_MISMATCH)', async () => {
    const stub: RepositoryProvisioner = {
      provision: () => Promise.resolve(err({ code: 'OWNER_MISMATCH' as const })),
      reconcile: () => Promise.resolve(err({ code: 'INTERRUPTED' as const })),
    };
    const { request } = await makeService(stub).submit({
      spec: makeSpec(),
      idempotencyKey: key(1),
    });
    expect(request).toMatchObject({ status: 'FAILED', error: { code: 'OWNER_MISMATCH' } });
  });
});
