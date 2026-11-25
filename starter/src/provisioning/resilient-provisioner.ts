import { retry, RetryExhaustedError } from '../async/retry.js';
import type { RetryPolicy } from '../async/retry.js';
import { withTimeout } from '../async/timeout.js';
import type { GitHubRepositoryInfo, RepositorySpec } from '../domain/request.js';
import { classifyGitHubError, isRetryableGitHubError, toErrorCode } from '../github/classify.js';
import { GitHubApiError } from '../github/errors.js';
import type { GitHubClient } from '../github/types.js';
import { err, ok } from '../shared/result.js';
import type {
  ProvisionContext,
  ProvisionFailure,
  ProvisionResult,
  RepositoryProvisioner,
} from './types.js';
import { NotImplementedError } from '../shared/not-implemented.js';

export interface ResilientProvisionerOptions {
  readonly github: GitHubClient;
  /** 1回のGitHub呼び出しのタイムアウト。 */
  readonly timeoutMs: number;
  readonly retryPolicy: RetryPolicy;
  /** 時計のずれを許容する幅。作成日時の比較に使う。 */
  readonly skewToleranceMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

// TODO(ex08): docs/exercises/08-error-handling.md の仕様に従って実装する。
// provision: 認証ユーザー確認(ownerType=user) → 作成(リトライ付き) → topics設定
// reconcile: 中断された要求の後始末
export class ResilientProvisioner implements RepositoryProvisioner {
  constructor(private readonly options: ResilientProvisionerOptions) {}

  async provision(_spec: RepositorySpec, _context: ProvisionContext): Promise<ProvisionResult> {
    throw new NotImplementedError('08');
  }

  async reconcile(_spec: RepositorySpec, _context: ProvisionContext): Promise<ProvisionResult> {
    throw new NotImplementedError('08');
  }
}
