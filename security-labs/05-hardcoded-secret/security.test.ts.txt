import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildLabApp } from './app.js';

// テスト用のダミー値(実在しない)
const ENV = { SIGNING_KEY: 'k'.repeat(40), ADMIN_PASSWORD: 'p'.repeat(20) };

describe('正常な利用', () => {
  it('トークンを発行できる', async () => {
    const app = buildLabApp(ENV);
    const res = await app.inject({ url: '/token', query: { user: 'alice' } });
    expect(res.json<{ token: string }>().token).toMatch(/^alice\.[0-9a-f]{64}$/);
    await app.close();
  });
});

describe('秘密情報は環境変数から受け取る', () => {
  it('秘密が設定されていなければ起動に失敗する(弱い既定値で動かない)', () => {
    expect(() => buildLabApp({})).toThrow();
    expect(() => buildLabApp({ SIGNING_KEY: 'short', ADMIN_PASSWORD: 'short' })).toThrow();
  });

  it('設定された鍵で署名する(鍵が違えば署名も違う)', async () => {
    const a = buildLabApp(ENV);
    const b = buildLabApp({ ...ENV, SIGNING_KEY: 'z'.repeat(40) });
    const ta = (await a.inject({ url: '/token', query: { user: 'alice' } })).json<{ token: string }>().token;
    const tb = (await b.inject({ url: '/token', query: { user: 'alice' } })).json<{ token: string }>().token;
    expect(ta).not.toBe(tb);
    await a.close();
    await b.close();
  });

  it('管理者パスワードは環境変数の値と一致したときだけ通る', async () => {
    const app = buildLabApp(ENV);
    expect((await app.inject({ url: '/admin', query: { password: ENV.ADMIN_PASSWORD } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/admin', query: { password: 'wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/admin' })).statusCode).toBe(401);
    await app.close();
  });
});

describe('ソースコードに秘密が書かれていない(簡易スキャン)', () => {
  it('鍵・パスワード・トークンっぽい名前の変数に、長い文字列リテラルを代入していない', () => {
    const source = readFileSync(new URL('./app.ts', import.meta.url), 'utf8');
    const suspicious = [...source.matchAll(/(key|secret|password|passwd|token)\w*\s*=\s*['"`]([^'"`]{8,})['"`]/gi)];
    expect(suspicious.map((m) => m[0])).toEqual([]);
  });
});
