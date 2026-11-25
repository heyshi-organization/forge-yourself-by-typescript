import { TimeoutError } from '../async/timeout.js';
import type { ErrorCode } from '../errors/catalog.js';
import { GitHubApiError } from './errors.js';
import type { GitHubErrorKind } from './errors.js';
import { NotImplementedError } from '../shared/not-implemented.js';

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

// TODO(ex08): docs/exercises/08-error-handling.md の分類表に従って実装する
export function classifyGitHubError(_error: unknown, _now: Date = new Date()): GitHubApiError {
  throw new NotImplementedError('08');
}

export function isRetryableGitHubError(_error: GitHubApiError): boolean {
  throw new NotImplementedError('08');
}

export function toErrorCode(_kind: GitHubErrorKind): ErrorCode {
  throw new NotImplementedError('08');
}
