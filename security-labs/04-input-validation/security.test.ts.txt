import { describe, expect, it } from 'vitest';
import { buildLabApp } from './app.js';

const create = async (body: unknown) => {
  const app = buildLabApp();
  const res = await app.inject({ method: 'POST', url: '/requests', payload: body as object });
  await app.close();
  return res;
};

describe('正常な利用', () => {
  it('作成でき、サーバーが status=PENDING を決める', async () => {
    const res = await create({ name: 'demo', visibility: 'private' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'demo', visibility: 'private', status: 'PENDING' });
  });
});

describe('入力値検証(不正な入力は拒否または無視されなければならない)', () => {
  it('Mass Assignment: クライアントが status / owner を指定して上書きできてはいけない', async () => {
    const res = await create({ name: 'demo', visibility: 'private', status: 'SUCCEEDED', owner: 'admin' });
    if (res.statusCode === 201) {
      expect(res.json()).toMatchObject({ status: 'PENDING', owner: 'anonymous' });
    } else {
      expect(res.statusCode).toBe(400);
    }
  });

  it.each([
    ['name が数値', { name: 123, visibility: 'private' }],
    ['name が空', { name: '', visibility: 'private' }],
    ['name にパス区切り', { name: '../x', visibility: 'private' }],
    ['visibility が不正', { name: 'demo', visibility: 'internal' }],
    ['必須項目なし', { name: 'demo' }],
    ['配列', ['a']],
  ])('%s は 400', async (_label, body) => {
    expect((await create(body)).statusCode).toBe(400);
  });

  it.each(['abc', '-1', '0', '1000000', '1.5', 'NaN'])('limit=%s は 400', async (limit) => {
    const app = buildLabApp();
    const res = await app.inject({ method: 'GET', url: '/requests', query: { limit } });
    await app.close();
    expect(res.statusCode).toBe(400);
  });

  it('limit の既定値は使える', async () => {
    const app = buildLabApp();
    const res = await app.inject({ method: 'GET', url: '/requests' });
    await app.close();
    expect(res.statusCode).toBe(200);
  });
});
