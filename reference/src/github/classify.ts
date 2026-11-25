import { TimeoutError } from '../async/timeout.js';
import type { ErrorCode } from '../errors/catalog.js';
import { GitHubApiError } from './errors.js';
import type { GitHubErrorKind } from './errors.js';

/** Octokit(RequestError)のうち、分類に必要な部分だけを表した形。 */
interface HttpErrorLike {
  status?: unknown;
  message?: unknown;
  response?: { headers?: Record<string, unknown>; data?: unknown };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function header(error: HttpErrorLike, name: string): string | undefined {
  const value = error.response?.headers?.[name];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

// @starter-begin ex08
/** レート制限で「何ms待てばよいか」を読み取る。分からなければ undefined。 */
function readRetryAfterMs(error: HttpErrorLike, now: Date): number | undefined {
  const retryAfter = header(error, 'retry-after');
  if (retryAfter !== undefined && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;

  const reset = header(error, 'x-ratelimit-reset');
  if (reset !== undefined && /^\d+$/.test(reset)) {
    return Math.max(0, Number(reset) * 1000 - now.getTime());
  }
  return undefined;
}

function hasAlreadyExistsError(error: HttpErrorLike): boolean {
  const data = error.response?.data;
  if (!isObject(data) || !Array.isArray(data.errors)) return false;
  return data.errors.some(
    (e) => isObject(e) && typeof e.message === 'string' && /already exists/i.test(e.message),
  );
}

/**
 * GitHub/Octokit が投げた「何でもありの unknown」を、アプリが扱える GitHubApiError に分類する。
 * 想定外の形でも例外を投げず、必ず GitHubApiError を返すこと。
 */
export function classifyGitHubError(error: unknown, now: Date = new Date()): GitHubApiError {
  if (error instanceof GitHubApiError) return error;
  if (error instanceof TimeoutError) {
    return new GitHubApiError('timeout', error.message, { cause: error });
  }
  if (!isObject(error)) {
    return new GitHubApiError('unknown', '不明なエラー', { cause: error });
  }

  // Octokit は AbortError に status=500 を付けて再throwする(RequestError には包まない)。
  // status で分類する前に、名前で「中断」を判定する。
  if (error.name === 'AbortError') {
    return new GitHubApiError(
      'timeout',
      typeof error.message === 'string' ? error.message : 'aborted',
      { cause: error },
    );
  }

  const e = error as HttpErrorLike;
  const message = typeof e.message === 'string' ? e.message : 'GitHub API error';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const base = { cause: error, ...(status === undefined ? {} : { status }) };

  if (status === undefined) {
    // HTTPレスポンスが無い = 接続エラー、または中断
    return new GitHubApiError('network', message, base);
  }
  if (status === 401) return new GitHubApiError('auth', message, base);

  if (status === 403 || status === 429) {
    const remaining = header(e, 'x-ratelimit-remaining');
    const isRateLimit =
      status === 429 ||
      remaining === '0' ||
      header(e, 'retry-after') !== undefined ||
      /rate limit/i.test(message);
    if (isRateLimit) {
      const retryAfterMs = readRetryAfterMs(e, now);
      return new GitHubApiError('rate_limit', message, {
        ...base,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    }
    return new GitHubApiError('permission', message, base);
  }

  if (status === 404) return new GitHubApiError('not_found', message, base);
  if (status === 422) {
    return new GitHubApiError(hasAlreadyExistsError(e) ? 'conflict' : 'rejected', message, base);
  }
  if (status >= 500) {
    // Octokitは接続エラーを status 500 の RequestError に包む。レスポンスが無ければ network 扱い。
    return new GitHubApiError(e.response === undefined ? 'network' : 'unavailable', message, base);
  }
  if (status >= 400) return new GitHubApiError('rejected', message, base);
  return new GitHubApiError('unknown', message, base);
}

/** 再試行してよい失敗か。入力や権限の問題は何度やっても結果は変わらないので再試行しない。 */
export function isRetryableGitHubError(error: GitHubApiError): boolean {
  switch (error.kind) {
    case 'rate_limit':
    case 'unavailable':
    case 'network':
    case 'timeout':
      return true;
    case 'auth':
    case 'permission':
    case 'conflict':
    case 'rejected':
    case 'not_found':
    case 'unknown':
      return false;
  }
}

/** GitHubの失敗の種類を、利用者に返すエラーコードに対応づける。 */
export function toErrorCode(kind: GitHubErrorKind): ErrorCode {
  switch (kind) {
    case 'auth':
      return 'GITHUB_AUTH_FAILED';
    case 'permission':
      return 'GITHUB_PERMISSION_DENIED';
    case 'rate_limit':
      return 'GITHUB_RATE_LIMITED';
    case 'conflict':
      return 'REPOSITORY_ALREADY_EXISTS';
    case 'rejected':
    case 'not_found':
      return 'GITHUB_REJECTED';
    case 'unavailable':
    case 'network':
      return 'GITHUB_UNAVAILABLE';
    case 'timeout':
      return 'GITHUB_TIMEOUT';
    case 'unknown':
      return 'INTERNAL_ERROR';
  }
}
// @starter-else
//| // TODO(ex08): docs/exercises/08-error-handling.md の分類表に従って実装する
//| export function classifyGitHubError(_error: unknown, _now: Date = new Date()): GitHubApiError {
//|   throw new NotImplementedError('08');
//| }
//|
//| export function isRetryableGitHubError(_error: GitHubApiError): boolean {
//|   throw new NotImplementedError('08');
//| }
//|
//| export function toErrorCode(_kind: GitHubErrorKind): ErrorCode {
//|   throw new NotImplementedError('08');
//| }
// @starter-end
