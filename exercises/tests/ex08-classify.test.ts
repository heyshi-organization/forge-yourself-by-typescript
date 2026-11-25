import { describe, expect, it } from 'vitest';
import { TimeoutError } from '@app/async/timeout.js';
import { classifyGitHubError, isRetryableGitHubError, toErrorCode } from '@app/github/classify.js';
import { GITHUB_ERROR_KINDS, GitHubApiError } from '@app/github/errors.js';

const now = new Date('2026-01-01T00:00:00Z');
const http = (
  status: number,
  headers: Record<string, string> = {},
  data: unknown = {},
  message = 'msg',
) => Object.assign(new Error(message), { status, response: { headers, data } });

describe('classifyGitHubError', () => {
  it('401 → auth', () => {
    expect(classifyGitHubError(http(401)).kind).toBe('auth');
  });
  it('403(通常) → permission', () => {
    expect(classifyGitHubError(http(403, {}, {}, 'Resource not accessible')).kind).toBe(
      'permission',
    );
  });
  it('403 + x-ratelimit-remaining: 0 → rate_limit。reset から待ち時間を計算', () => {
    const reset = String(now.getTime() / 1000 + 90);
    const e = classifyGitHubError(
      http(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }),
      now,
    );
    expect(e.kind).toBe('rate_limit');
    expect(e.retryAfterMs).toBe(90_000);
  });
  it('403 + retry-after(二次レート制限) → rate_limit', () => {
    const e = classifyGitHubError(http(403, { 'retry-after': '30' }));
    expect(e.kind).toBe('rate_limit');
    expect(e.retryAfterMs).toBe(30_000);
  });
  it('403 でメッセージに rate limit → rate_limit(待ち時間不明)', () => {
    const e = classifyGitHubError(http(403, {}, {}, 'You have exceeded a secondary rate limit'));
    expect(e.kind).toBe('rate_limit');
    expect(e.retryAfterMs).toBeUndefined();
  });
  it('429 → rate_limit', () => {
    expect(classifyGitHubError(http(429)).kind).toBe('rate_limit');
  });
  it('reset が過去なら待ち時間は 0', () => {
    const e = classifyGitHubError(http(429, { 'x-ratelimit-reset': '1' }), now);
    expect(e.retryAfterMs).toBe(0);
  });
  it('404 → not_found', () => {
    expect(classifyGitHubError(http(404)).kind).toBe('not_found');
  });
  it('422 + "already exists" → conflict', () => {
    const data = {
      message: 'Repository creation failed.',
      errors: [{ message: 'name already exists on this account' }],
    };
    expect(classifyGitHubError(http(422, {}, data)).kind).toBe('conflict');
  });
  it('422 その他 → rejected', () => {
    expect(
      classifyGitHubError(http(422, {}, { errors: [{ message: 'name is too long' }] })).kind,
    ).toBe('rejected');
    expect(classifyGitHubError(http(422)).kind).toBe('rejected');
  });
  it('5xx → unavailable', () => {
    expect(classifyGitHubError(http(503)).kind).toBe('unavailable');
    expect(classifyGitHubError(http(502)).kind).toBe('unavailable');
  });
  it('レスポンスの無い status 500(Octokitが包んだ接続エラー) → network', () => {
    const e = Object.assign(new Error('fetch failed'), { status: 500 });
    expect(classifyGitHubError(e).kind).toBe('network');
  });
  it('status の無いエラー → network、AbortError → timeout', () => {
    expect(classifyGitHubError(new Error('ECONNRESET')).kind).toBe('network');
    expect(
      classifyGitHubError(Object.assign(new Error('aborted'), { name: 'AbortError' })).kind,
    ).toBe('timeout');
  });
  it('Octokit は AbortError に status=500 を付けて投げる。それでも timeout(network ではない)', () => {
    const e = Object.assign(new Error('aborted'), { name: 'AbortError', status: 500 });
    expect(classifyGitHubError(e).kind).toBe('timeout');
  });
  it('自前の TimeoutError → timeout', () => {
    expect(classifyGitHubError(new TimeoutError('x', 10)).kind).toBe('timeout');
  });
  it('その他の4xx → rejected', () => {
    expect(classifyGitHubError(http(400)).kind).toBe('rejected');
  });
  it('2xx/3xx のようなありえない status → unknown', () => {
    expect(classifyGitHubError(http(302)).kind).toBe('unknown');
  });
  it.each([null, undefined, 'string', 42])('%j のような想定外の値でも例外を投げず unknown', (v) => {
    expect(classifyGitHubError(v).kind).toBe('unknown');
  });
  it('分類済みのエラーはそのまま返す', () => {
    const e = new GitHubApiError('auth', 'x');
    expect(classifyGitHubError(e)).toBe(e);
  });
  it('元のエラーを cause に保持する(ログで追跡できる)', () => {
    const original = http(503);
    expect(classifyGitHubError(original).cause).toBe(original);
  });
});

describe('isRetryableGitHubError / toErrorCode', () => {
  const retryable = ['rate_limit', 'unavailable', 'network', 'timeout'];
  it.each(GITHUB_ERROR_KINDS)('%s の再試行可否', (kind) => {
    expect(isRetryableGitHubError(new GitHubApiError(kind, 'x'))).toBe(retryable.includes(kind));
  });
  it('すべての kind が、カタログにあるコードに対応づく', () => {
    for (const kind of GITHUB_ERROR_KINDS) expect(toErrorCode(kind)).toMatch(/^[A-Z_]+$/);
    expect(toErrorCode('auth')).toBe('GITHUB_AUTH_FAILED');
    expect(toErrorCode('conflict')).toBe('REPOSITORY_ALREADY_EXISTS');
    expect(toErrorCode('timeout')).toBe('GITHUB_TIMEOUT');
  });
  it('ambiguous: タイムアウト・ネットワーク・5xx・不明 だけが「結果不明」', () => {
    const ambiguous = GITHUB_ERROR_KINDS.filter((k) => new GitHubApiError(k, 'x').ambiguous);
    expect(ambiguous).toEqual(['unavailable', 'network', 'timeout', 'unknown']);
  });
});
