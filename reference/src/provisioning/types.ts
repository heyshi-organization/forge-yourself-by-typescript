import type { GitHubRepositoryInfo, RepositorySpec } from '../domain/request.js';
import type { ErrorCode } from '../errors/catalog.js';
import type { AppLogger } from '../logging/logger.js';
import type { Result } from '../shared/result.js';

export interface ProvisionContext {
  /** 作成要求のID(ログの相関用)。 */
  readonly requestId: string;
  /** 処理を開始した時刻(ISO)。GitHub側のリポジトリが「今回作られたもの」か判定する基準。 */
  readonly startedAt: string;
  readonly logger: AppLogger;
}

export interface ProvisionSuccess {
  readonly repository: GitHubRepositoryInfo;
  /** 例: ['TOPICS_NOT_APPLIED'] */
  readonly warnings: readonly string[];
}

export interface ProvisionFailure {
  readonly code: ErrorCode;
  /** ログ用の原因。利用者には返さない。 */
  readonly cause?: unknown;
}

export type ProvisionResult = Result<ProvisionSuccess, ProvisionFailure>;

/**
 * 「GitHub上にリポジトリを用意する」というユースケースの境界(ポート)。
 * ProvisioningService はこのインターフェースだけに依存する。
 */
export interface RepositoryProvisioner {
  provision(spec: RepositorySpec, context: ProvisionContext): Promise<ProvisionResult>;
  /**
   * 処理中に中断された要求の後始末。GitHub上に「今回の処理で作られたリポジトリ」があれば成功扱いにする。
   */
  reconcile(spec: RepositorySpec, context: ProvisionContext): Promise<ProvisionResult>;
}
