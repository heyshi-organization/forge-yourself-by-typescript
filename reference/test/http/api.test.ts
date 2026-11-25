import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteRequestRepository } from '@app/db/sqlite-request-repository.js';
import { hashSpec } from '@app/domain/request-hash.js';
import { FakeGitHubClient } from '@app/github/fake-github-client.js';
import { createRepositoryBodySchema, toRepositorySpec } from '@app/schemas/repository.js';
import { ERROR_CATALOG } from '@app/errors/catalog.js';
import { FAKE_PAT, createTestEnv, httpError, validBody } from '../helpers.js';
import type { TestEnv } from '../helpers.js';

let env: TestEnv;
afterEach(async () => {
  await env.close();
});

const KEY = 'key-12345678';
const post = (body: unknown, headers: Record<string, string> = { 'idempotency-key': KEY }) =>
  env.app.inject({
    method: 'POST',
    url: '/v1/repository-requests',
    payload: body as object,
    headers,
  });

describe('基本', () => {
  beforeEach(() => {
    env = createTestEnv();
  });

  it('GET /healthz', async () => {
    const res = await env.app.inject('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('存在しないパスは JSON の 404(エラー形式が統一されている)', async () => {
    const res = await env.app.inject('/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'NOT_FOUND', correlationId: expect.any(String) as string },
    });
  });

  it('セキュリティ関連のレスポンスヘッダ', async () => {
    const res = await env.app.inject('/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('X-Correlation-Id: 安全な値は引き継ぎ、不正な値は新規発行する', async () => {
    const ok = await env.app.inject({
      url: '/healthz',
      headers: { 'x-correlation-id': 'trace-abc12345' },
    });
    expect(ok.headers['x-correlation-id']).toBe('trace-abc12345');
    const evil = await env.app.inject({
      url: '/healthz',
      headers: { 'x-correlation-id': 'a\r\nb' },
    });
    expect(evil.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    const generated = await env.app.inject('/healthz');
    expect(generated.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('POST /v1/repository-requests', () => {
  beforeEach(() => {
    env = createTestEnv();
  });

  it('201: 作成でき、Location と結果が返る。DBにも保存される', async () => {
    const res = await post({
      ...validBody,
      description: 'demo',
      topics: ['typescript'],
      autoInit: true,
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe('/v1/repository-requests/req-1');
    expect(res.json()).toMatchObject({
      id: 'req-1',
      status: 'SUCCEEDED',
      spec: {
        owner: 'acme',
        name: 'demo-repo',
        description: 'demo',
        topics: ['typescript'],
        autoInit: true,
      },
      repository: { fullName: 'acme/demo-repo', htmlUrl: 'https://github.com/acme/demo-repo' },
      warnings: [],
      error: null,
    });
    expect(env.github.topicsOf('acme', 'demo-repo')).toEqual(['typescript']);

    const got = await env.app.inject('/v1/repository-requests/req-1');
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('200 + Idempotent-Replayed: 同じキーの再送は前回の結果を返す', async () => {
    const first = await post(validBody);
    const second = await post(validBody);
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());
    expect(env.github.countCalls('createRepository')).toBe(1);
  });

  it('422: 同じキーで内容が違う', async () => {
    await post(validBody);
    const res = await post({ ...validBody, visibility: 'public' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  describe('400/415/413: 入力の問題', () => {
    it('Idempotency-Key が無い', async () => {
      const res = await post(validBody, {});
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    });
    it('Idempotency-Key が不正', async () => {
      const res = await post(validBody, { 'idempotency-key': 'short' });
      expect(res.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_INVALID' } });
    });
    it('項目が不正: どの項目がなぜ不正かを返し、入力値は返さない', async () => {
      const res = await post({ ...validBody, name: 'bad name/../x', visibility: 'internal' });
      expect(res.statusCode).toBe(400);
      const body = res.json<{
        error: { code: string; details: { path: string; message: string }[] };
      }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.map((d) => d.path).sort()).toEqual(['name', 'visibility']);
      expect(res.body).not.toContain('bad name/../x');
    });
    it('想定外のフィールド', async () => {
      const res = await post({ ...validBody, isAdmin: true });
      expect(res.statusCode).toBe(400);
    });
    it('壊れたJSON', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/v1/repository-requests',
        payload: '{"owner":',
        headers: { 'content-type': 'application/json', 'idempotency-key': KEY },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    });
    it('ボディなし', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/v1/repository-requests',
        headers: { 'idempotency-key': KEY },
      });
      expect(res.statusCode).toBe(400);
    });
    it('Content-Type が JSON ではない', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/v1/repository-requests',
        payload: 'a=b',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': KEY },
      });
      expect(res.statusCode).toBe(415);
      expect(res.json()).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
    });
    it('ボディが大きすぎる', async () => {
      const res = await post({ ...validBody, description: 'x'.repeat(20_000) });
      expect(res.statusCode).toBe(413);
      expect(res.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    });
  });

  describe('GitHub の失敗がどう見えるか', () => {
    const fail = (error: Error, times = 1) =>
      env.github.enqueue(
        'createRepository',
        ...Array.from({ length: times }, () => ({ type: 'fail' as const, error })),
      );

    it.each([
      ['認証エラー', () => fail(httpError(401)), 502, 'GITHUB_AUTH_FAILED'],
      [
        '権限不足',
        () => fail(httpError(403, {}, {}, 'Resource not accessible')),
        502,
        'GITHUB_PERMISSION_DENIED',
      ],
      [
        '名前の重複',
        () => fail(httpError(422, {}, { errors: [{ message: 'name already exists' }] })),
        409,
        'REPOSITORY_ALREADY_EXISTS',
      ],
      [
        '内容の拒否',
        () => fail(httpError(422, {}, { errors: [{ message: 'bad' }] })),
        422,
        'GITHUB_REJECTED',
      ],
      [
        'レート制限(長い)',
        () => fail(httpError(429, { 'retry-after': '3600' })),
        503,
        'GITHUB_RATE_LIMITED',
      ],
      ['一時障害(リトライ超過)', () => fail(httpError(503), 3), 503, 'GITHUB_UNAVAILABLE'],
    ])('%s → %i %s', async (_label, arrange, status, code) => {
      arrange();
      const res = await post(validBody);
      expect(res.statusCode).toBe(status);
      const body = res.json<{ error: { code: string; message: string; requestId: string } }>();
      expect(body.error.code).toBe(code);
      expect(body.error.message).toBe(ERROR_CATALOG[code as keyof typeof ERROR_CATALOG].message);
      expect(body.error.requestId).toBe('req-1');

      // 失敗も保存され、あとから参照できる
      const got = await env.app.inject('/v1/repository-requests/req-1');
      expect(got.json()).toMatchObject({ status: 'FAILED', error: { code } });
    });

    it('タイムアウト → 504', async () => {
      env.github.enqueue(
        'createRepository',
        ...Array.from({ length: 3 }, () => ({ type: 'hang' as const })),
      );
      const res = await post(validBody);
      expect(res.statusCode).toBe(504);
      expect(res.json()).toMatchObject({ error: { code: 'GITHUB_TIMEOUT' } });
    });

    it('失敗の再送は同じ失敗(Idempotent-Replayed)を返し、GitHub を再度呼ばない', async () => {
      fail(httpError(401));
      await post(validBody);
      const again = await post(validBody);
      expect(again.statusCode).toBe(502);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(env.github.countCalls('createRepository')).toBe(1);
    });

    it('利用者向けレスポンスに内部の詳細(GitHubのメッセージ・スタック)が含まれない', async () => {
      fail(httpError(401, {}, {}, `Bad credentials for token ${FAKE_PAT}`));
      const res = await post(validBody);
      expect(res.body).not.toContain(FAKE_PAT);
      expect(res.body).not.toContain('Bad credentials');
      expect(res.body).not.toContain('stack');
      expect(JSON.stringify(env.logs.lines)).not.toContain(FAKE_PAT); // ログでも伏せられる
    });
  });

  describe('内部エラー', () => {
    it('SQLite への保存失敗 → 500 INTERNAL_ERROR(詳細は返さない)。ログには残る', async () => {
      env.db.exec('DROP TABLE provisioning_requests');
      const res = await post(validBody);
      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
      expect(res.body).not.toMatch(/sqlite|provisioning_requests|no such table/i);
      expect(env.logs.raw()).toMatch(/no such table/);
    });

    it('想定外の例外(TypeError等)も汎用メッセージになる', async () => {
      env.github.enqueue('createRepository', { type: 'fail', error: 'a string was thrown' });
      const res = await post(validBody);
      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
      expect(res.body).not.toContain('a string was thrown');
    });
  });

  it('ownerType=user で owner が認証ユーザーと違う → 422 OWNER_MISMATCH', async () => {
    const res = await post({ ...validBody, ownerType: 'user', owner: 'someone-else' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: { code: 'OWNER_MISMATCH' } });
  });

  it('同じキーの要求が処理中なら 409 REQUEST_IN_PROGRESS + Retry-After。放置されたらリース切れ後に復旧される', async () => {
    const requests = new SqliteRequestRepository(env.db);
    const spec = toRepositorySpec(createRepositoryBodySchema.parse(validBody));
    const now = env.clock.now().toISOString();
    await requests.createOrGet({
      id: 'stuck-1',
      idempotencyKey: 'inflight-key-1',
      requestHash: hashSpec(spec),
      spec,
      now,
    });
    await requests.transition('stuck-1', 'PENDING', { to: 'PROCESSING', now });

    const busy = await post(validBody, { 'idempotency-key': 'inflight-key-1' });
    expect(busy.statusCode).toBe(409);
    expect(busy.headers['retry-after']).toBe('5');
    expect(busy.json()).toMatchObject({
      error: { code: 'REQUEST_IN_PROGRESS', requestId: 'stuck-1' },
    });

    env.clock.advance(10 * 60 * 1000); // リース(既定5分)を超える
    const recovered = await post(validBody, { 'idempotency-key': 'inflight-key-1' });
    // GitHub 上にリポジトリが無いので「中断」として失敗が確定する(自動で再作成はしない)
    expect(recovered.statusCode).toBe(500);
    expect(recovered.json()).toMatchObject({
      error: { code: 'INTERRUPTED', requestId: 'stuck-1' },
    });
    expect(env.github.countCalls('createRepository')).toBe(0);
  });
});

describe('GET', () => {
  beforeEach(async () => {
    env = createTestEnv();
    for (let i = 1; i <= 3; i++) {
      await post({ ...validBody, name: `repo-${i}` }, { 'idempotency-key': `key-0000000${i}` });
    }
    env.github.enqueue('createRepository', { type: 'fail', error: httpError(401) });
    await post({ ...validBody, name: 'repo-4' }, { 'idempotency-key': 'key-00000004' });
  });

  it('一覧: 新しい順・ページング・total', async () => {
    const res = await env.app.inject('/v1/repository-requests?limit=2&offset=1');
    const body = res.json<{
      items: { id: string }[];
      total: number;
      limit: number;
      offset: number;
    }>();
    expect(body).toMatchObject({ total: 4, limit: 2, offset: 1 });
    expect(body.items).toHaveLength(2);
  });
  it('一覧: status で絞り込める', async () => {
    const res = await env.app.inject('/v1/repository-requests?status=FAILED');
    const body = res.json<{ items: { status: string }[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.items[0]?.status).toBe('FAILED');
  });
  it.each(['limit=0', 'limit=1000', 'offset=-1', 'status=DONE', 'unknown=1'])(
    '一覧: 不正なクエリ %s は 400',
    async (q) => {
      const res = await env.app.inject(`/v1/repository-requests?${q}`);
      expect(res.statusCode).toBe(400);
    },
  );
  it('詳細: 存在しないID は 404', async () => {
    const res = await env.app.inject('/v1/repository-requests/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
  it('詳細: 失敗した要求は error を持ち、repository は null', async () => {
    const res = await env.app.inject('/v1/repository-requests/req-4');
    expect(res.json()).toMatchObject({
      status: 'FAILED',
      repository: null,
      error: { code: 'GITHUB_AUTH_FAILED' },
    });
  });
});

describe('ログ', () => {
  it('リクエストごとに correlationId・処理結果・処理時間が構造化ログに出る', async () => {
    env = createTestEnv();
    await post(validBody);
    const completed = env.logs.lines.find((l) => l.msg === 'request completed');
    expect(completed).toMatchObject({
      correlationId: expect.any(String) as string,
      res: { statusCode: 201 },
    });
    expect(typeof completed?.responseTime).toBe('number');
    expect(
      env.logs.lines.some((l) => l.requestId === 'req-1' && l.msg === '要求の処理が完了'),
    ).toBe(true);
  });
});

describe('ローカル動作確認用の Fake(simulate-*)', () => {
  it('名前で障害を再現できる', async () => {
    env = createTestEnv({ github: new FakeGitHubClient({ simulateByName: true }) });
    const res = await post({ ...validBody, name: 'simulate-auth' });
    expect(res.statusCode).toBe(502);
  });
});
