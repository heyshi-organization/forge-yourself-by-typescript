import { describe, expect, it } from 'vitest';
import { GitHubApiError } from '@app/github/errors.js';
import { OctokitGitHubClient } from '@app/github/octokit-client.js';
import { makeSpec } from '@test/helpers.js';

interface Recorded {
  url: string;
  method: string;
  body: unknown;
  auth: string | null;
}

/** 実ネットワークを使わず、Octokit の fetch を差し替えてリクエスト内容と応答を制御する。 */
function fakeFetch(respond: (r: Recorded) => Response | Promise<Response>) {
  const requests: Recorded[] = [];
  const fetchImpl = (async (input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? req?.headers);
    const raw = init?.body ?? (req ? await req.text() : undefined);
    const rec: Recorded = {
      url: req?.url ?? (input instanceof URL ? input.href : (input as string)),
      method: (init?.method ?? req?.method ?? 'GET').toUpperCase(),
      body: typeof raw === 'string' && raw ? (JSON.parse(raw) as unknown) : undefined,
      auth: headers.get('authorization'),
    };
    requests.push(rec);
    return respond(rec);
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const repoPayload = {
  id: 42,
  full_name: 'acme/demo-repo',
  html_url: 'https://github.com/acme/demo-repo',
  created_at: '2026-01-01T00:00:00Z',
};

function client(respond: Parameters<typeof fakeFetch>[0]) {
  const f = fakeFetch(respond);
  return {
    c: new OctokitGitHubClient({ token: 'dummy-token-for-test', fetch: f.fetchImpl }),
    ...f,
  };
}

describe('OctokitGitHubClient', () => {
  it('organization: POST /orgs/{org}/repos に正しい内容を送り、結果を変換する', async () => {
    const { c, requests } = client(() => json(201, repoPayload));
    const info = await c.createRepository(
      makeSpec({ description: 'hi', visibility: 'private', autoInit: true }),
    );
    expect(info).toEqual({
      id: 42,
      fullName: 'acme/demo-repo',
      htmlUrl: 'https://github.com/acme/demo-repo',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: expect.stringContaining('/orgs/acme/repos') as string,
      body: { name: 'demo-repo', description: 'hi', private: true, auto_init: true },
      auth: 'token dummy-token-for-test',
    });
  });

  it('user: POST /user/repos を使う。public は private=false', async () => {
    const { c, requests } = client(() => json(201, repoPayload));
    await c.createRepository(makeSpec({ ownerType: 'user', visibility: 'public' }));
    expect(requests[0]?.url).toMatch(/\/user\/repos$/);
    expect(requests[0]?.body).toMatchObject({ private: false });
  });

  it('getRepository: 404 は null、それ以外は分類したエラー', async () => {
    const notFound = client(() => json(404, { message: 'Not Found' }));
    expect(await notFound.c.getRepository('acme', 'x')).toBeNull();
    const down = client(() => json(503, { message: 'down' }));
    await expect(down.c.getRepository('acme', 'x')).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('replaceTopics: PUT /repos/{owner}/{repo}/topics', async () => {
    const { c, requests } = client(() => json(200, { names: ['a'] }));
    await c.replaceTopics('acme', 'demo-repo', ['a', 'b']);
    expect(requests[0]).toMatchObject({ method: 'PUT', body: { names: ['a', 'b'] } });
    expect(requests[0]?.url).toContain('/repos/acme/demo-repo/topics');
  });

  it('getAuthenticatedLogin', async () => {
    const { c } = client(() => json(200, { login: 'octocat' }));
    expect(await c.getAuthenticatedLogin()).toBe('octocat');
  });

  it.each([
    [401, { message: 'Bad credentials' }, {}, 'auth'],
    [403, { message: 'Resource not accessible by personal access token' }, {}, 'permission'],
    [
      403,
      { message: 'API rate limit exceeded' },
      { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '9999999999' },
      'rate_limit',
    ],
    [429, { message: 'slow down' }, { 'retry-after': '5' }, 'rate_limit'],
    [
      422,
      {
        message: 'Repository creation failed.',
        errors: [
          {
            resource: 'Repository',
            code: 'custom',
            field: 'name',
            message: 'name already exists on this account',
          },
        ],
      },
      {},
      'conflict',
    ],
    [500, { message: 'oops' }, {}, 'unavailable'],
  ])('HTTP %i を %s に分類する', async (status, body, headers, kind) => {
    const { c } = client(() => json(status, body, headers));
    const error = await c.createRepository(makeSpec()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).kind).toBe(kind);
  });

  it('接続エラーは network に分類する', async () => {
    const { c } = client(() => {
      throw new TypeError('fetch failed');
    });
    await expect(c.createRepository(makeSpec())).rejects.toMatchObject({ kind: 'network' });
  });

  it('エラーに認証トークンが含まれない', async () => {
    const { c } = client(() => json(401, { message: 'Bad credentials' }));
    const error = await c.createRepository(makeSpec()).catch((e: unknown) => e as Error);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(
      'dummy-token-for-test',
    );
  });
});
