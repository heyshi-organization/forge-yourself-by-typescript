// 課題06の受け入れテスト: 依存性の注入(DI)とサービス層の基本。
// プロビジョナー(GitHub側)はスタブ、保存先はインメモリ実装を「注入」して検証する。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { buildContainer } from '@app/composition.js';
import { InMemoryRequestRepository } from '@app/db/in-memory-request-repository.js';
import type { RepositoryRequest } from '@app/domain/request.js';
import { AppError } from '@app/errors/app-error.js';
import type { ProvisionResult, RepositoryProvisioner } from '@app/provisioning/types.js';
import { parseConfig } from '@app/schemas/config.js';
import { ProvisioningService } from '@app/services/provisioning-service.js';
import { ManualClock } from '@app/shared/clock.js';
import { SequentialIds } from '@app/shared/ids.js';
import { err, ok } from '@app/shared/result.js';
import { captureLogs, makeSpec } from '@test/helpers.js';

const info = {
  id: 7,
  fullName: 'acme/demo-repo',
  htmlUrl: 'https://github.com/acme/demo-repo',
  createdAt: '2026-01-01T00:00:00Z',
};

let clock: ManualClock;
let requests: InMemoryRequestRepository;
type ProvisionFn = (...args: unknown[]) => Promise<ProvisionResult>;
let provisioner: { provision: Mock<ProvisionFn>; reconcile: Mock<ProvisionFn> };
let service: ProvisioningService;

async function seedPending(id = 'req-1', name = 'demo-repo'): Promise<RepositoryRequest> {
  const { request } = await requests.createOrGet({
    id,
    idempotencyKey: `key-${id}-00000`,
    requestHash: 'h',
    spec: makeSpec({ name }),
    now: clock.now().toISOString(),
  });
  return request;
}

beforeEach(() => {
  clock = new ManualClock();
  requests = new InMemoryRequestRepository();
  provisioner = { provision: vi.fn<ProvisionFn>(), reconcile: vi.fn<ProvisionFn>() };
  service = new ProvisioningService({
    requests,
    provisioner: provisioner,
    clock,
    ids: new SequentialIds(),
    logger: captureLogs().logger,
    leaseMs: 60_000,
  });
});

describe('ProvisioningService.process', () => {
  it('成功: PENDING → PROCESSING → SUCCEEDED。結果が保存される', async () => {
    provisioner.provision.mockImplementation(() => {
      clock.advance(1500);
      return Promise.resolve(
        ok({ repository: info, warnings: ['TOPICS_NOT_APPLIED'] }) satisfies ProvisionResult,
      );
    });
    const pending = await seedPending();
    const done = await service.process(pending);

    expect(done).toMatchObject({
      status: 'SUCCEEDED',
      repository: info,
      warnings: ['TOPICS_NOT_APPLIED'],
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.500Z',
    });
    expect(await requests.findById('req-1')).toEqual(done);
  });

  it('プロビジョナーには「開始時刻(startedAt)」と要求IDを渡す', async () => {
    provisioner.provision.mockResolvedValue(ok({ repository: info, warnings: [] }));
    await service.process(await seedPending());
    expect(provisioner.provision).toHaveBeenCalledTimes(1);
    expect(provisioner.provision).toHaveBeenCalledWith(
      makeSpec(),
      expect.objectContaining({ requestId: 'req-1', startedAt: '2026-01-01T00:00:00.000Z' }),
    );
  });

  it('失敗: FAILED になり、エラーコードと「利用者向けメッセージ」が保存される', async () => {
    provisioner.provision.mockResolvedValue(
      err({ code: 'GITHUB_AUTH_FAILED', cause: new Error('detail: token xyz') }),
    );
    const done = await service.process(await seedPending());
    expect(done.status).toBe('FAILED');
    if (done.status === 'FAILED') {
      expect(done.error.code).toBe('GITHUB_AUTH_FAILED');
      expect(done.error.message).toContain('GitHub');
      expect(JSON.stringify(done)).not.toContain('token xyz'); // 内部の詳細は保存しない
    }
  });

  it('プロビジョナーが想定外の例外を投げても PROCESSING のまま残らず、FAILED(INTERNAL_ERROR)になる', async () => {
    provisioner.provision.mockRejectedValue(new TypeError('bug'));
    const done = await service.process(await seedPending());
    expect(done).toMatchObject({ status: 'FAILED', error: { code: 'INTERNAL_ERROR' } });
  });

  it('PENDING 以外(すでに処理中など)の要求は処理せず、AppError(REQUEST_IN_PROGRESS)', async () => {
    const pending = await seedPending();
    await requests.transition('req-1', 'PENDING', {
      to: 'PROCESSING',
      now: clock.now().toISOString(),
    });
    await expect(service.process(pending)).rejects.toMatchObject({ code: 'REQUEST_IN_PROGRESS' });
    expect(provisioner.provision).not.toHaveBeenCalled();
  });
});

describe('ProvisioningService.get / list', () => {
  it('get: 無ければ AppError(NOT_FOUND)', async () => {
    await expect(service.get('nope')).rejects.toBeInstanceOf(AppError);
    await expect(service.get('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('get / list: 保存されたものを返す', async () => {
    await seedPending('req-1', 'one');
    await seedPending('req-2', 'two');
    expect((await service.get('req-1')).id).toBe('req-1');
    expect(await service.list({ limit: 1, offset: 0 })).toMatchObject({
      total: 2,
      limit: 1,
      offset: 0,
    });
  });
});

describe('Composition Root: buildContainer', () => {
  const config = parseConfig({ GITHUB_CLIENT: 'fake', LOG_LEVEL: 'silent' });

  it('保存先とプロビジョナーを差し替えて組み立てられる(SQLiteもGitHubも使わない)', async () => {
    const container = buildContainer(config, {
      requests,
      provisioner: provisioner as unknown as RepositoryProvisioner,
      clock,
      ids: new SequentialIds(),
    });
    try {
      expect(container.service).toBeInstanceOf(ProvisioningService);
      expect(container.db).toBeNull();
      expect((await container.app.inject('/healthz')).statusCode).toBe(200);
      await seedPending('req-9', 'nine');
      const res = await container.app.inject('/v1/repository-requests/req-9');
      expect(res.json()).toMatchObject({ id: 'req-9', status: 'PENDING' });
    } finally {
      await container.close();
    }
  });
});
