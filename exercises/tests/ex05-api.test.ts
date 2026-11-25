// 課題05の受け入れテスト: HTTP APIの基本構造。
// サービス層はスタブに差し替えているので、ex06 以降が未実装でも検証できる。
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryRequest } from '@app/domain/request.js';
import { AppError } from '@app/errors/app-error.js';
import { buildApp } from '@app/http/app.js';
import type { ProvisioningService } from '@app/services/provisioning-service.js';
import { captureLogs, makeSpec, validBody } from '@test/helpers.js';

const base = {
  id: 'req-1',
  idempotencyKey: 'key-12345678',
  requestHash: 'h',
  spec: makeSpec(),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:01.000Z',
};
const succeeded = {
  ...base,
  status: 'SUCCEEDED',
  startedAt: base.createdAt,
  finishedAt: base.updatedAt,
  repository: {
    id: 1,
    fullName: 'acme/demo-repo',
    htmlUrl: 'https://github.com/acme/demo-repo',
    createdAt: base.createdAt,
  },
  warnings: [],
} as RepositoryRequest;
const failed = (code: string) =>
  ({
    ...base,
    status: 'FAILED',
    startedAt: base.createdAt,
    finishedAt: base.updatedAt,
    error: { code, message: 'm' },
  }) as RepositoryRequest;

const service = { submit: vi.fn(), get: vi.fn(), list: vi.fn() };
let app: FastifyInstance;
beforeEach(() => {
  vi.resetAllMocks();
  app = buildApp({
    service: service as unknown as ProvisioningService,
    logger: captureLogs().logger,
  });
});
afterEach(async () => {
  await app.close();
});

const KEY = 'key-12345678';
const post = (payload: unknown, headers: Record<string, string> = { 'idempotency-key': KEY }) =>
  app.inject({
    method: 'POST',
    url: '/v1/repository-requests',
    payload: payload as object,
    headers,
  });

describe('共通の挙動', () => {
  it('GET /healthz', async () => {
    const res = await app.inject('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('存在しないパスは、統一されたエラー形式の404', async () => {
    const res = await app.inject('/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String) as string,
        correlationId: expect.any(String) as string,
      },
    });
  });

  it('レスポンスヘッダ: nosniff / no-store', async () => {
    const res = await app.inject('/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('X-Correlation-Id: 安全な値は引き継ぎ、不正な値は新しく発行する', async () => {
    const ok = await app.inject({
      url: '/healthz',
      headers: { 'x-correlation-id': 'trace-abc12345' },
    });
    expect(ok.headers['x-correlation-id']).toBe('trace-abc12345');
    const evil = await app.inject({ url: '/healthz', headers: { 'x-correlation-id': 'a\r\nb' } });
    expect(evil.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /openapi.json', async () => {
    const res = await app.inject('/openapi.json');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ openapi: string }>().openapi).toMatch(/^3\./);
  });
});

describe('POST /v1/repository-requests', () => {
  it('201: サービスに検証済みの spec と Idempotency-Key を渡し、Location を返す', async () => {
    service.submit.mockResolvedValue({ request: succeeded, replayed: false });
    const res = await post({ ...validBody, topics: ['ts'], autoInit: true });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe('/v1/repository-requests/req-1');
    expect(res.json()).toMatchObject({
      id: 'req-1',
      status: 'SUCCEEDED',
      repository: { fullName: 'acme/demo-repo' },
    });
    expect(service.submit).toHaveBeenCalledWith({
      idempotencyKey: KEY,
      spec: {
        owner: 'acme',
        ownerType: 'organization',
        name: 'demo-repo',
        description: null,
        visibility: 'private',
        autoInit: true,
        topics: ['ts'],
      },
    });
  });

  it('200 + Idempotent-Replayed: サービスが replayed=true を返したとき', async () => {
    service.submit.mockResolvedValue({ request: succeeded, replayed: true });
    const res = await post(validBody);
    expect(res.statusCode).toBe(200);
    expect(res.headers['idempotent-replayed']).toBe('true');
  });

  describe('入力の検証(サービスは呼ばれない)', () => {
    it('Idempotency-Key が無い → 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
      const res = await post(validBody, {});
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    });
    it('Idempotency-Key が不正 → 400 IDEMPOTENCY_KEY_INVALID', async () => {
      const res = await post(validBody, { 'idempotency-key': 'short' });
      expect(res.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_INVALID' } });
    });
    it('項目の不正 → 400 VALIDATION_ERROR。どの項目かを返し、入力値は返さない', async () => {
      const res = await post({ ...validBody, name: 'bad name/../x', visibility: 'internal' });
      expect(res.statusCode).toBe(400);
      const body = res.json<{ error: { code: string; details: { path: string }[] } }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.map((d) => d.path).sort()).toEqual(['name', 'visibility']);
      expect(res.body).not.toContain('bad name/../x');
    });
    it('想定外のフィールド → 400', async () => {
      expect((await post({ ...validBody, isAdmin: true })).statusCode).toBe(400);
    });
    it('壊れたJSON → 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/repository-requests',
        payload: '{"owner":',
        headers: { 'content-type': 'application/json', 'idempotency-key': KEY },
      });
      expect(res.statusCode).toBe(400);
    });
    it('Content-Type が JSON ではない → 415', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/repository-requests',
        payload: 'a=b',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': KEY },
      });
      expect(res.statusCode).toBe(415);
      expect(res.json()).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
    });
    it('ボディが大きすぎる(16KB超) → 413', async () => {
      const res = await post({ ...validBody, description: 'x'.repeat(20_000) });
      expect(res.statusCode).toBe(413);
    });
    afterEach(() => {
      expect(service.submit).not.toHaveBeenCalled();
    });
  });

  describe('保存済みの失敗(FAILED)を、エラーコードに応じたHTTPステータスで返す', () => {
    it.each([
      ['GITHUB_AUTH_FAILED', 502],
      ['GITHUB_PERMISSION_DENIED', 502],
      ['REPOSITORY_ALREADY_EXISTS', 409],
      ['GITHUB_REJECTED', 422],
      ['OWNER_MISMATCH', 422],
      ['GITHUB_RATE_LIMITED', 503],
      ['GITHUB_UNAVAILABLE', 503],
      ['GITHUB_TIMEOUT', 504],
      ['INTERRUPTED', 500],
      ['INTERNAL_ERROR', 500],
      ['SOMETHING_UNKNOWN', 500],
    ])('%s → %i', async (code, status) => {
      service.submit.mockResolvedValue({ request: failed(code), replayed: false });
      const res = await post(validBody);
      expect(res.statusCode).toBe(status);
      expect(res.json()).toMatchObject({ error: { requestId: 'req-1' } });
    });
  });

  it('サービスが AppError を投げたら、そのコードに対応するステータス(409 + Retry-After)', async () => {
    service.submit.mockRejectedValue(
      new AppError('REQUEST_IN_PROGRESS', { requestId: 'req-9', retryAfterSeconds: 5 }),
    );
    const res = await post(validBody);
    expect(res.statusCode).toBe(409);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.json()).toMatchObject({
      error: { code: 'REQUEST_IN_PROGRESS', requestId: 'req-9' },
    });
  });

  it('想定外の例外は 500 INTERNAL_ERROR。例外のメッセージは利用者に返さない', async () => {
    service.submit.mockRejectedValue(new TypeError('secret internal detail: /var/db/app.sqlite'));
    const res = await post(validBody);
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(res.body).not.toContain('secret internal detail');
    expect(res.body).not.toContain('app.sqlite');
  });
});

describe('GET /v1/repository-requests', () => {
  it('クエリを検証・変換(文字列→数値、既定値)してサービスに渡し、結果を返す', async () => {
    service.list.mockResolvedValue({ items: [succeeded], total: 7, limit: 5, offset: 10 });
    const res = await app.inject('/v1/repository-requests?limit=5&offset=10&status=SUCCEEDED');
    expect(service.list).toHaveBeenCalledWith({ limit: 5, offset: 10, status: 'SUCCEEDED' });
    expect(res.json()).toMatchObject({ total: 7, limit: 5, offset: 10, items: [{ id: 'req-1' }] });

    service.list.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    await app.inject('/v1/repository-requests');
    expect(service.list).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
  });
  it.each(['limit=0', 'limit=101', 'offset=-1', 'status=DONE', 'unknown=1'])(
    '不正なクエリ %s → 400',
    async (q) => {
      expect((await app.inject(`/v1/repository-requests?${q}`)).statusCode).toBe(400);
      expect(service.list).not.toHaveBeenCalled();
    },
  );
});

describe('GET /v1/repository-requests/:id', () => {
  it('200: 状態と結果を返す。内部用の項目(idempotencyKey / requestHash)は含めない', async () => {
    service.get.mockResolvedValue(succeeded);
    const res = await app.inject('/v1/repository-requests/req-1');
    expect(service.get).toHaveBeenCalledWith('req-1');
    expect(res.json()).toMatchObject({ id: 'req-1', status: 'SUCCEEDED' });
    expect(res.body).not.toMatch(/idempotencyKey|requestHash/);
  });
  it('404: サービスが NOT_FOUND を投げたとき', async () => {
    service.get.mockRejectedValue(new AppError('NOT_FOUND'));
    const res = await app.inject('/v1/repository-requests/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
