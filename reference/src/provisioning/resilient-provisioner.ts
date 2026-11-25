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

// @starter-begin ex08
/**
 * タイムアウト・リトライ・「結果が分からない失敗」への対処を持つプロビジョナー。
 *
 * 重要な考え方:
 *   POST(作成)をタイムアウトした後に再試行して「すでに存在する(conflict)」と言われた場合、
 *   最初のリクエストが実は成功していたのかもしれない。
 *   その場合は GitHub 上のリポジトリの作成日時を見て、今回の処理で作られたものか判定する。
 */
export class ResilientProvisioner implements RepositoryProvisioner {
  private readonly skewToleranceMs: number;

  constructor(private readonly options: ResilientProvisionerOptions) {
    this.skewToleranceMs = options.skewToleranceMs ?? 60_000;
  }

  async provision(spec: RepositorySpec, context: ProvisionContext): Promise<ProvisionResult> {
    let ambiguousSeen = false;
    try {
      if (spec.ownerType === 'user') {
        const login = await this.call('getAuthenticatedLogin', context, (signal) =>
          this.options.github.getAuthenticatedLogin({ signal }),
        );
        if (login.toLowerCase() !== spec.owner.toLowerCase()) {
          return err({ code: 'OWNER_MISMATCH' });
        }
      }

      const repository = await this.call(
        'createRepository',
        context,
        (signal) => this.options.github.createRepository(spec, { signal }),
        async (error) => {
          ambiguousSeen ||= error.ambiguous;
          if (error.kind === 'conflict' && ambiguousSeen) {
            const existing = await this.lookup(spec, context);
            if (existing && this.isCreatedByThisRun(existing, context)) {
              context.logger.warn(
                { requestId: context.requestId },
                '再試行中に conflict を受信。作成日時から、以前の試行で作成済みと判断',
              );
              return existing;
            }
          }
          return undefined;
        },
      );
      return ok(await this.finish(spec, repository, context));
    } catch (error) {
      const failure = this.toFailure(error);
      // 結果が分からない失敗で終わった場合、最後に一度だけ「作られていないか」確認する。
      if (ambiguousSeen && failure.code !== 'REPOSITORY_ALREADY_EXISTS') {
        const recovered = await this.tryLookup(spec, context);
        if (recovered) return ok(await this.finish(spec, recovered, context));
      }
      return err(failure);
    }
  }

  async reconcile(spec: RepositorySpec, context: ProvisionContext): Promise<ProvisionResult> {
    try {
      const existing = await this.call('getRepository', context, (signal) =>
        this.options.github.getRepository(spec.owner, spec.name, { signal }),
      );
      if (existing === null) return err({ code: 'INTERRUPTED' });
      if (!this.isCreatedByThisRun(existing, context))
        return err({ code: 'REPOSITORY_ALREADY_EXISTS' });
      return ok(await this.finish(spec, existing, context));
    } catch (error) {
      return err(this.toFailure(error));
    }
  }

  /** topics を設定する。失敗してもリポジトリ自体は作成済みなので、警告として返す。 */
  private async finish(
    spec: RepositorySpec,
    repository: GitHubRepositoryInfo,
    context: ProvisionContext,
  ) {
    const warnings: string[] = [];
    if (spec.topics.length > 0) {
      try {
        await this.call('replaceTopics', context, (signal) =>
          this.options.github.replaceTopics(spec.owner, spec.name, spec.topics, { signal }),
        );
      } catch (error) {
        warnings.push('TOPICS_NOT_APPLIED');
        context.logger.warn(
          { requestId: context.requestId, err: this.toFailure(error).cause },
          'topicsの設定に失敗',
        );
      }
    }
    return { repository, warnings };
  }

  private isCreatedByThisRun(repo: GitHubRepositoryInfo, context: ProvisionContext): boolean {
    return Date.parse(repo.createdAt) >= Date.parse(context.startedAt) - this.skewToleranceMs;
  }

  private lookup(spec: RepositorySpec, context: ProvisionContext) {
    return this.call('getRepository', context, (signal) =>
      this.options.github.getRepository(spec.owner, spec.name, { signal }),
    );
  }

  private async tryLookup(spec: RepositorySpec, context: ProvisionContext) {
    try {
      const repo = await withTimeout(
        (signal) => this.options.github.getRepository(spec.owner, spec.name, { signal }),
        this.options.timeoutMs,
        'GitHub getRepository',
      );
      return repo && this.isCreatedByThisRun(repo, context) ? repo : null;
    } catch {
      return null;
    }
  }

  /** タイムアウト + リトライ + エラー分類 + ログ をまとめた共通の呼び出し口。 */
  private call<T>(
    operation: string,
    context: ProvisionContext,
    fn: (signal: AbortSignal) => Promise<T>,
    recover?: (error: GitHubApiError) => Promise<T | undefined>,
  ): Promise<T> {
    const log = context.logger;
    return retry(
      async (attempt) => {
        const started = performance.now();
        try {
          const value = await withTimeout(fn, this.options.timeoutMs, `GitHub ${operation}`);
          log.info(
            {
              requestId: context.requestId,
              operation,
              attempt,
              outcome: 'ok',
              durationMs: Math.round(performance.now() - started),
            },
            'GitHub API呼び出し成功',
          );
          return value;
        } catch (raw) {
          const error = classifyGitHubError(raw);
          log.warn(
            {
              requestId: context.requestId,
              operation,
              attempt,
              outcome: 'error',
              kind: error.kind,
              status: error.status,
              durationMs: Math.round(performance.now() - started),
            },
            'GitHub API呼び出し失敗',
          );
          const recovered = await recover?.(error);
          if (recovered !== undefined) return recovered;
          throw error;
        }
      },
      {
        policy: this.options.retryPolicy,
        isRetryable: (e) => e instanceof GitHubApiError && isRetryableGitHubError(e),
        delayHintMs: (e) => (e instanceof GitHubApiError ? e.retryAfterMs : undefined),
        ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
        ...(this.options.random ? { random: this.options.random } : {}),
        onRetry: ({ attempt, delayMs }) =>
          log.info(
            { requestId: context.requestId, operation, attempt, delayMs },
            'GitHub API呼び出しを再試行',
          ),
      },
    );
  }

  private toFailure(error: unknown): ProvisionFailure {
    const inner = error instanceof RetryExhaustedError ? error.lastError : error;
    if (inner instanceof GitHubApiError) {
      return { code: toErrorCode(inner.kind), cause: inner };
    }
    return { code: 'INTERNAL_ERROR', cause: error };
  }
}
// @starter-else
//| // TODO(ex08): docs/exercises/08-error-handling.md の仕様に従って実装する。
//| // provision: 認証ユーザー確認(ownerType=user) → 作成(リトライ付き) → topics設定
//| // reconcile: 中断された要求の後始末
//| export class ResilientProvisioner implements RepositoryProvisioner {
//|   constructor(private readonly options: ResilientProvisionerOptions) {}
//|
//|   async provision(_spec: RepositorySpec, _context: ProvisionContext): Promise<ProvisionResult> {
//|     throw new NotImplementedError('08');
//|   }
//|
//|   async reconcile(_spec: RepositorySpec, _context: ProvisionContext): Promise<ProvisionResult> {
//|     throw new NotImplementedError('08');
//|   }
//| }
// @starter-end
