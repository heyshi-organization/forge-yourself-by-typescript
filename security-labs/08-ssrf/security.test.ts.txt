import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLabApp } from './app.js';

// グローバルの fetch を差し替えて、「どのURLにリクエストが飛んだか」を記録する(実際の通信はしない)
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('image-bytes', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const get = async (url: string) => {
  const app = buildLabApp();
  const res = await app.inject({ method: 'GET', url: '/avatar', query: { url } });
  await app.close();
  return res;
};

describe('正常な利用', () => {
  it('許可されたホストの画像は取得できる', async () => {
    const res = await get('https://avatars.githubusercontent.com/u/1?v=4');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 200, bytes: 11 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('SSRF(サーバーの内側や許可外へのリクエストを送ってはいけない)', () => {
  it.each([
    ['ループバック', 'http://127.0.0.1:8080/admin'],
    ['localhost', 'https://localhost/admin'],
    ['クラウドのメタデータ', 'http://169.254.169.254/latest/meta-data/'],
    ['プライベートIP', 'https://10.0.0.5/internal'],
    ['file スキーム', 'file:///etc/passwd'],
    ['許可外の外部ホスト', 'https://evil.example.com/a.png'],
    ['前方一致の偽装', 'https://avatars.githubusercontent.com.evil.example.com/a.png'],
    ['認証情報による偽装', 'https://avatars.githubusercontent.com@evil.example.com/a.png'],
    ['http(非TLS)', 'http://avatars.githubusercontent.com/u/1'],
    ['想定外のポート', 'https://avatars.githubusercontent.com:8443/u/1'],
    ['URLではない', 'not a url'],
  ])('%s は拒否し、リクエストを送らない', async (_label, url) => {
    const res = await get(url);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('リダイレクトを追従しない(許可ホストから内部へ誘導されるのを防ぐ)', async () => {
    await get('https://avatars.githubusercontent.com/u/1');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.redirect).toBe('error');
  });

  it('応答しない相手のためにタイムアウトを設定している', async () => {
    await get('https://avatars.githubusercontent.com/u/1');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
