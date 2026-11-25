import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildLabApp } from './app.js';

let app: FastifyInstance;
beforeEach(async () => {
  app = buildLabApp();
  // alice が1件作成する(id=1)
  await app.inject({ method: 'POST', url: '/items', headers: { 'x-user': 'alice' }, payload: { name: 'alice-private' } });
});

const as = (user: string, method: 'GET' | 'DELETE', url: string, extra: Record<string, string> = {}) =>
  app.inject({ method, url, headers: { 'x-user': user, ...extra } });

describe('正常な利用', () => {
  it('持ち主は自分のデータを取得・削除できる', async () => {
    expect((await as('alice', 'GET', '/items/1')).json()).toMatchObject({ name: 'alice-private' });
    expect((await as('alice', 'DELETE', '/items/1')).statusCode).toBe(204);
  });
  it('管理者は統計を見られる', async () => {
    const res = await as('root', 'GET', '/admin/stats', { 'x-role': 'admin' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 1 });
  });
});

describe('認可(他人のデータや管理機能に触れてはいけない)', () => {
  it('他のユーザーは、他人のデータを取得できない(IDOR)', async () => {
    const res = await as('bob', 'GET', '/items/1');
    expect([403, 404]).toContain(res.statusCode);
    expect(res.body).not.toContain('alice-private');
  });

  it('他のユーザーは、他人のデータを削除できない', async () => {
    const res = await as('bob', 'DELETE', '/items/1');
    expect([403, 404]).toContain(res.statusCode);
    expect((await as('alice', 'GET', '/items/1')).statusCode).toBe(200); // まだ存在する
  });

  it('一般ユーザーは管理機能を使えない', async () => {
    expect((await as('bob', 'GET', '/admin/stats')).statusCode).toBe(403);
  });

  it('x-role ヘッダを偽装しても管理者にはなれない(権限はサーバー側で決める)', async () => {
    expect((await as('bob', 'GET', '/admin/stats', { 'x-role': 'admin' })).statusCode).toBe(403);
  });

  it('未認証・未知のユーザーは 401', async () => {
    expect((await app.inject('/items/1')).statusCode).toBe(401);
    expect((await as('mallory', 'GET', '/items/1')).statusCode).toBe(401);
  });
});
