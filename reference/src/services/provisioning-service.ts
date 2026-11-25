import { mapWithConcurrency } from '../async/concurrency.js';
import { InFlightConflictError } from '../db/request-repository.js';
import type { ListFilter, RequestRepository } from '../db/request-repository.js';
import { hashSpec } from '../domain/request-hash.js';
import type { RepositoryRequest, RepositorySpec } from '../domain/request.js';
import { AppError } from '../errors/app-error.js';
import { ERROR_CATALOG } from '../errors/catalog.js';
import type { AppLogger } from '../logging/logger.js';
import type { ProvisionResult, RepositoryProvisioner } from '../provisioning/types.js';
import { nowIso } from '../shared/clock.js';
import type { Clock } from '../shared/clock.js';
import type { IdGenerator } from '../shared/ids.js';
import type { Page } from '../shared/page.js';
import { err } from '../shared/result.js';

export interface ProvisioningServiceDeps {
  readonly requests: RequestRepository;
  readonly provisioner: RepositoryProvisioner;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: AppLogger;
  /** PROCESSING のまま、この時間を超えた要求は「処理が中断された」とみなす。 */
  readonly leaseMs: number;
}

export interface SubmitInput {
  readonly spec: RepositorySpec;
  readonly idempotencyKey: string;
}

export interface SubmitOutput {
  readonly request: RepositoryRequest;
  /** 過去の同じ Idempotency-Key の結果を返した場合 true。 */
  readonly replayed: boolean;
}

export interface RecoveryReport {
  readonly checked: number;
  readonly outcomes: readonly { id: string; status: string }[];
}

/**
 * リポジトリ作成要求のユースケース。HTTPにもDBにもGitHubにも直接は依存せず、
 * コンストラクタで受け取ったインターフェース(ポート)だけを使う(依存性の注入)。
 */
export class ProvisioningService {
  constructor(private readonly deps: ProvisioningServiceDeps) {}

  // @starter-begin ex06
  async get(id: string): Promise<RepositoryRequest> {
    const request = await this.deps.requests.findById(id);
    if (!request) throw new AppError('NOT_FOUND');
    return request;
  }

  list(filter: ListFilter): Promise<Page<RepositoryRequest>> {
    return this.deps.requests.list(filter);
  }

  /**
   * PENDING の要求を処理する: PENDING -> PROCESSING -> (GitHub呼び出し) -> SUCCEEDED | FAILED
   * 各遷移は compare-and-set なので、同じ要求を2か所が同時に処理しても二重実行にならない。
   */
  async process(request: RepositoryRequest): Promise<RepositoryRequest> {
    const { requests, provisioner, clock, logger } = this.deps;
    const claimed = await requests.transition(request.id, 'PENDING', {
      to: 'PROCESSING',
      now: nowIso(clock),
    });
    if (!claimed || claimed.status !== 'PROCESSING') {
      throw new AppError('REQUEST_IN_PROGRESS', { requestId: request.id, retryAfterSeconds: 5 });
    }

    const log = logger.child({ requestId: claimed.id });
    log.info({ owner: claimed.spec.owner, repo: claimed.spec.name }, '要求の処理を開始');

    let outcome: ProvisionResult;
    try {
      outcome = await provisioner.provision(claimed.spec, {
        requestId: claimed.id,
        startedAt: claimed.startedAt,
        logger: log,
      });
    } catch (error) {
      // プロビジョナーは例外を投げない契約だが、バグでも要求が PROCESSING のまま残らないようにする
      outcome = err({ code: 'INTERNAL_ERROR', cause: error });
    }
    return this.finalize(claimed, outcome);
  }

  /** 結果を保存して終端状態にする。 */
  private async finalize(
    processing: Extract<RepositoryRequest, { status: 'PROCESSING' }>,
    outcome: ProvisionResult,
  ): Promise<RepositoryRequest> {
    const { requests, clock, logger } = this.deps;
    const log = logger.child({ requestId: processing.id });
    const now = nowIso(clock);

    try {
      const saved = outcome.ok
        ? await requests.transition(processing.id, 'PROCESSING', {
            to: 'SUCCEEDED',
            now,
            repository: outcome.value.repository,
            warnings: outcome.value.warnings,
          })
        : await requests.transition(processing.id, 'PROCESSING', {
            to: 'FAILED',
            now,
            error: {
              code: outcome.error.code,
              message: ERROR_CATALOG[outcome.error.code].message,
            },
          });

      if (!saved) {
        // 別の処理(復旧など)が先に終端状態にした。その結果を返す。
        const latest = await requests.findById(processing.id);
        if (latest) return latest;
        throw new AppError('INTERNAL_ERROR', { internalDetail: '要求が消えています' });
      }

      if (outcome.ok) {
        log.info(
          {
            status: saved.status,
            repository: outcome.value.repository.fullName,
            warnings: outcome.value.warnings,
          },
          '要求の処理が完了',
        );
      } else {
        const level = outcome.error.code === 'INTERNAL_ERROR' ? 'error' : 'warn';
        log[level](
          { status: saved.status, code: outcome.error.code, err: outcome.error.cause },
          '要求の処理が失敗',
        );
      }
      return saved;
    } catch (error) {
      if (error instanceof AppError) throw error;
      // 最悪のケース: GitHubでは作成できたのに、結果をDBに保存できなかった。
      // 要求は PROCESSING のまま残り、後の再送または起動時の復旧(reconcile)で解決される。
      log.error(
        {
          err: error,
          githubRepository: outcome.ok ? outcome.value.repository.fullName : undefined,
        },
        '処理結果の保存に失敗。要求は PROCESSING のまま残る(復旧処理で解決される)',
      );
      throw error;
    }
  }
  // @starter-else
  //|   // TODO(ex06): get / list / process を実装する(docs/exercises/06-dependency-injection.md)
  //|   async get(_id: string): Promise<RepositoryRequest> {
  //|     throw new NotImplementedError('06');
  //|   }
  //|
  //|   list(_filter: ListFilter): Promise<Page<RepositoryRequest>> {
  //|     throw new NotImplementedError('06');
  //|   }
  //|
  //|   async process(_request: RepositoryRequest): Promise<RepositoryRequest> {
  //|     throw new NotImplementedError('06');
  //|   }
  //|
  //|   // ex10 で finalize を使う場合は、自分で private メソッドとして追加してよい
  // @starter-end

  // @starter-begin ex10
  /**
   * リポジトリ作成要求を受け付ける(冪等)。
   *  - 初めてのキー: 保存して処理する
   *  - 同じキー・同じ内容: 前回の結果を返す(再実行しない)
   *  - 同じキー・違う内容: 422
   *  - 同じキーで処理中: 409
   */
  async submit(input: SubmitInput): Promise<SubmitOutput> {
    const { requests, clock, ids } = this.deps;
    const requestHash = hashSpec(input.spec);

    let stored: { request: RepositoryRequest; created: boolean };
    try {
      stored = await requests.createOrGet({
        id: ids.next(),
        idempotencyKey: input.idempotencyKey,
        requestHash,
        spec: input.spec,
        now: nowIso(clock),
      });
    } catch (error) {
      if (error instanceof InFlightConflictError)
        throw new AppError('REPOSITORY_REQUEST_IN_PROGRESS');
      throw error;
    }

    if (stored.created) {
      return { request: await this.process(stored.request), replayed: false };
    }
    if (stored.request.requestHash !== requestHash) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED', { requestId: stored.request.id });
    }
    return { request: await this.resolveReplay(stored.request), replayed: true };
  }

  private async resolveReplay(request: RepositoryRequest): Promise<RepositoryRequest> {
    if (request.status === 'SUCCEEDED' || request.status === 'FAILED') return request;

    if (!this.isStale(request)) {
      throw new AppError('REQUEST_IN_PROGRESS', { requestId: request.id, retryAfterSeconds: 5 });
    }
    return this.recover(request);
  }

  private isStale(request: RepositoryRequest): boolean {
    return Date.parse(request.updatedAt) < this.deps.clock.now().getTime() - this.deps.leaseMs;
  }

  /**
   * 中断された要求を後始末する。
   *  - PENDING: まだGitHubを呼んでいない。通常どおり処理する。
   *  - PROCESSING: GitHubを呼んだかもしれない。reconcile で「実際に作られたか」を確認する。
   */
  async recover(request: RepositoryRequest): Promise<RepositoryRequest> {
    if (request.status === 'PENDING') return this.process(request);
    if (request.status !== 'PROCESSING') return request;

    const log = this.deps.logger.child({ requestId: request.id });
    log.warn('中断された要求を復旧します');
    let outcome: ProvisionResult;
    try {
      outcome = await this.deps.provisioner.reconcile(request.spec, {
        requestId: request.id,
        startedAt: request.startedAt,
        logger: log,
      });
    } catch (error) {
      outcome = err({ code: 'INTERNAL_ERROR', cause: error });
    }
    return this.finalize(request, outcome);
  }

  /** 起動時などに、中断されたまま残っている要求をまとめて復旧する。 */
  async recoverStale(concurrency = 3): Promise<RecoveryReport> {
    const { requests, clock, leaseMs, logger } = this.deps;
    const cutoff = new Date(clock.now().getTime() - leaseMs).toISOString();
    const stale = await requests.findStale(['PENDING', 'PROCESSING'], cutoff);

    const outcomes = await mapWithConcurrency(stale, concurrency, async (r) => {
      try {
        const recovered = await this.recover(r);
        return { id: r.id, status: recovered.status };
      } catch (error) {
        logger.error({ requestId: r.id, err: error }, '復旧に失敗');
        return { id: r.id, status: 'ERROR' };
      }
    });
    return { checked: stale.length, outcomes };
  }
  // @starter-else
  //|   // TODO(ex10): 冪等性と復旧を実装する(docs/exercises/10-idempotency.md)
  //|   async submit(_input: SubmitInput): Promise<SubmitOutput> {
  //|     throw new NotImplementedError('10');
  //|   }
  //|
  //|   async recover(_request: RepositoryRequest): Promise<RepositoryRequest> {
  //|     throw new NotImplementedError('10');
  //|   }
  //|
  //|   async recoverStale(_concurrency = 3): Promise<RecoveryReport> {
  //|     throw new NotImplementedError('10');
  //|   }
  // @starter-end
}
