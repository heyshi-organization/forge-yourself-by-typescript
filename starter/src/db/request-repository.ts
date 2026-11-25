import type {
  GitHubRepositoryInfo,
  RepositoryRequest,
  RepositorySpec,
  RequestError,
  RequestStatus,
} from '../domain/request.js';
import type { Page } from '../shared/page.js';

export interface NewRequest {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly spec: RepositorySpec;
  readonly now: string;
}

/** 状態遷移の内容。from(遷移前の状態)は transition() の引数で別に渡す。 */
export type TransitionTarget =
  | { readonly to: 'PROCESSING'; readonly now: string }
  | {
      readonly to: 'SUCCEEDED';
      readonly now: string;
      readonly repository: GitHubRepositoryInfo;
      readonly warnings: readonly string[];
    }
  | { readonly to: 'FAILED'; readonly now: string; readonly error: RequestError };

export interface ListFilter {
  readonly limit: number;
  readonly offset: number;
  readonly status?: RequestStatus | undefined;
}

/** 同じリポジトリ(owner/name)について、処理中の要求がすでにある。 */
export class InFlightConflictError extends Error {
  constructor() {
    super('同じリポジトリの処理中の要求が既に存在します');
    this.name = 'InFlightConflictError';
  }
}

/** 永続化の失敗(DB障害など)。原因は cause に持つ。 */
export class PersistenceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PersistenceError';
  }
}

/**
 * 作成要求の保存先(ポート)。実装: SqliteRequestRepository / InMemoryRequestRepository
 * 具体的なDBの知識(SQL等)は実装の中に閉じ込める。
 */
export interface RequestRepository {
  /**
   * 同じ idempotencyKey が無ければ PENDING で保存して created=true、
   * 既にあれば既存の要求を created=false で返す(原子的に行う)。
   * @throws InFlightConflictError 同じ owner/name の処理中要求が別にある場合
   */
  createOrGet(input: NewRequest): Promise<{ request: RepositoryRequest; created: boolean }>;

  findById(id: string): Promise<RepositoryRequest | null>;

  list(filter: ListFilter): Promise<Page<RepositoryRequest>>;

  /**
   * 現在の状態が from のときだけ target に遷移させる(楽観的ロック / compare-and-set)。
   * 現在の状態が from でなければ何もせず null を返す。
   * 許されない遷移(例: SUCCEEDED -> FAILED)は InvalidTransitionError。
   */
  transition(
    id: string,
    from: RequestStatus,
    target: TransitionTarget,
  ): Promise<RepositoryRequest | null>;

  /** 指定の状態のまま、updatedAt が olderThan(ISO)より前の要求。 */
  findStale(statuses: readonly RequestStatus[], olderThan: string): Promise<RepositoryRequest[]>;
}
