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
import { NotImplementedError } from '../shared/not-implemented.js';

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

  // TODO(ex06): get / list / process を実装する(docs/exercises/06-dependency-injection.md)
  async get(_id: string): Promise<RepositoryRequest> {
    throw new NotImplementedError('06');
  }

  list(_filter: ListFilter): Promise<Page<RepositoryRequest>> {
    throw new NotImplementedError('06');
  }

  async process(_request: RepositoryRequest): Promise<RepositoryRequest> {
    throw new NotImplementedError('06');
  }

  // ex10 で finalize を使う場合は、自分で private メソッドとして追加してよい

  // TODO(ex10): 冪等性と復旧を実装する(docs/exercises/10-idempotency.md)
  async submit(_input: SubmitInput): Promise<SubmitOutput> {
    throw new NotImplementedError('10');
  }

  async recover(_request: RepositoryRequest): Promise<RepositoryRequest> {
    throw new NotImplementedError('10');
  }

  async recoverStale(_concurrency = 3): Promise<RecoveryReport> {
    throw new NotImplementedError('10');
  }
}
