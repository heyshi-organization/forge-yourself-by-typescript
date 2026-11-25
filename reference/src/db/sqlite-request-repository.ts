import type Database from 'better-sqlite3';
import type { RepositoryRequest, RequestStatus } from '../domain/request.js';
import { assertTransition } from '../domain/state-machine.js';
import type { Page } from '../shared/page.js';
import { InFlightConflictError, PersistenceError } from './request-repository.js';
import type {
  ListFilter,
  NewRequest,
  RequestRepository,
  TransitionTarget,
} from './request-repository.js';

/** DBの1行(列名はスネークケース)。 */
interface Row {
  id: string;
  idempotency_key: string;
  request_hash: string;
  status: RequestStatus;
  owner: string;
  owner_type: 'user' | 'organization';
  repo_name: string;
  description: string | null;
  visibility: 'public' | 'private';
  auto_init: number;
  topics_json: string;
  github_repo_id: number | null;
  github_full_name: string | null;
  github_html_url: string | null;
  github_created_at: string | null;
  warnings_json: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// @starter-begin ex09
function isUniqueViolation(error: unknown, column: string): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes(column)
  );
}

/** すでに PersistenceError ならそのまま、そうでなければ包む(二重に包まない)。 */
function asPersistenceError(message: string, error: unknown): PersistenceError {
  return error instanceof PersistenceError ? error : new PersistenceError(message, error);
}

/** DBの行を、ドメインの判別可能Union型に変換する。status ごとに必須の列を検査する。 */
function toRequest(row: Row): RepositoryRequest {
  const base = {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    spec: {
      owner: row.owner,
      ownerType: row.owner_type,
      name: row.repo_name,
      description: row.description,
      visibility: row.visibility,
      autoInit: row.auto_init === 1,
      topics: JSON.parse(row.topics_json) as string[],
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const need = <T>(value: T | null, column: string): T => {
    if (value === null)
      throw new PersistenceError(`行 ${row.id} の ${column} が NULL です(DB不整合)`);
    return value;
  };

  switch (row.status) {
    case 'PENDING':
      return { ...base, status: 'PENDING' };
    case 'PROCESSING':
      return { ...base, status: 'PROCESSING', startedAt: need(row.started_at, 'started_at') };
    case 'SUCCEEDED':
      return {
        ...base,
        status: 'SUCCEEDED',
        startedAt: need(row.started_at, 'started_at'),
        finishedAt: need(row.finished_at, 'finished_at'),
        repository: {
          id: need(row.github_repo_id, 'github_repo_id'),
          fullName: need(row.github_full_name, 'github_full_name'),
          htmlUrl: need(row.github_html_url, 'github_html_url'),
          createdAt: need(row.github_created_at, 'github_created_at'),
        },
        warnings: JSON.parse(row.warnings_json) as string[],
      };
    case 'FAILED':
      return {
        ...base,
        status: 'FAILED',
        startedAt: need(row.started_at, 'started_at'),
        finishedAt: need(row.finished_at, 'finished_at'),
        error: {
          code: need(row.error_code, 'error_code'),
          message: need(row.error_message, 'error_message'),
        },
      };
  }
}

export class SqliteRequestRepository implements RequestRepository {
  constructor(private readonly db: Database.Database) {}

  private getRow(id: string): Row | undefined {
    return this.db.prepare('SELECT * FROM provisioning_requests WHERE id = ?').get(id) as
      Row | undefined;
  }

  async createOrGet(input: NewRequest): Promise<{ request: RepositoryRequest; created: boolean }> {
    try {
      // SELECT → INSERT の間に別の接続が割り込まないよう、トランザクション内で行う。
      return this.db.transaction(() => {
        const existing = this.db
          .prepare('SELECT * FROM provisioning_requests WHERE idempotency_key = ?')
          .get(input.idempotencyKey) as Row | undefined;
        if (existing) return { request: toRequest(existing), created: false };

        try {
          this.db
            .prepare(
              `INSERT INTO provisioning_requests
               (id, idempotency_key, request_hash, status, owner, owner_type, repo_name, description,
                visibility, auto_init, topics_json, created_at, updated_at)
               VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              input.id,
              input.idempotencyKey,
              input.requestHash,
              input.spec.owner,
              input.spec.ownerType,
              input.spec.name,
              input.spec.description,
              input.spec.visibility,
              input.spec.autoInit ? 1 : 0,
              JSON.stringify(input.spec.topics),
              input.now,
              input.now,
            );
        } catch (error) {
          if (isUniqueViolation(error, 'provisioning_requests.owner'))
            throw new InFlightConflictError();
          throw error;
        }
        return { request: toRequest(this.getRow(input.id) as Row), created: true };
      })();
    } catch (error) {
      if (error instanceof InFlightConflictError) throw error;
      throw asPersistenceError('作成要求の保存に失敗しました', error);
    }
  }

  async findById(id: string): Promise<RepositoryRequest | null> {
    try {
      const row = this.getRow(id);
      return row ? toRequest(row) : null;
    } catch (error) {
      throw asPersistenceError('作成要求の取得に失敗しました', error);
    }
  }

  async list(filter: ListFilter): Promise<Page<RepositoryRequest>> {
    try {
      // 値は必ずバインド変数(?)で渡す。文字列連結でSQLを組み立てない(SQLインジェクション対策)。
      const where = filter.status === undefined ? '' : 'WHERE status = ?';
      const args = filter.status === undefined ? [] : [filter.status];
      const total = (
        this.db
          .prepare(`SELECT COUNT(*) AS n FROM provisioning_requests ${where}`)
          .get(...args) as { n: number }
      ).n;
      const rows = this.db
        .prepare(
          `SELECT * FROM provisioning_requests ${where}
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(...args, filter.limit, filter.offset) as Row[];
      return { items: rows.map(toRequest), total, limit: filter.limit, offset: filter.offset };
    } catch (error) {
      throw asPersistenceError('作成要求の一覧取得に失敗しました', error);
    }
  }

  async transition(
    id: string,
    from: RequestStatus,
    target: TransitionTarget,
  ): Promise<RepositoryRequest | null> {
    assertTransition(from, target.to);
    try {
      return this.db.transaction(() => {
        // WHERE status = from が compare-and-set。条件が合わなければ0行更新になり、他の処理が先に進めたと分かる。
        let result: Database.RunResult;
        switch (target.to) {
          case 'PROCESSING':
            result = this.db
              .prepare(
                `UPDATE provisioning_requests SET status = 'PROCESSING', started_at = ?, updated_at = ?
                 WHERE id = ? AND status = ?`,
              )
              .run(target.now, target.now, id, from);
            break;
          case 'SUCCEEDED':
            result = this.db
              .prepare(
                `UPDATE provisioning_requests SET status = 'SUCCEEDED', finished_at = ?, updated_at = ?,
                   github_repo_id = ?, github_full_name = ?, github_html_url = ?, github_created_at = ?,
                   warnings_json = ?
                 WHERE id = ? AND status = ?`,
              )
              .run(
                target.now,
                target.now,
                target.repository.id,
                target.repository.fullName,
                target.repository.htmlUrl,
                target.repository.createdAt,
                JSON.stringify(target.warnings),
                id,
                from,
              );
            break;
          case 'FAILED':
            result = this.db
              .prepare(
                `UPDATE provisioning_requests SET status = 'FAILED', finished_at = ?, updated_at = ?,
                   error_code = ?, error_message = ?
                 WHERE id = ? AND status = ?`,
              )
              .run(target.now, target.now, target.error.code, target.error.message, id, from);
            break;
        }
        if (result.changes === 0) return null;
        return toRequest(this.getRow(id) as Row);
      })();
    } catch (error) {
      throw asPersistenceError('作成要求の状態更新に失敗しました', error);
    }
  }

  async findStale(
    statuses: readonly RequestStatus[],
    olderThan: string,
  ): Promise<RepositoryRequest[]> {
    if (statuses.length === 0) return [];
    try {
      const placeholders = statuses.map(() => '?').join(',');
      const rows = this.db
        .prepare(
          `SELECT * FROM provisioning_requests
           WHERE status IN (${placeholders}) AND updated_at < ? ORDER BY updated_at ASC`,
        )
        .all(...statuses, olderThan) as Row[];
      return rows.map(toRequest);
    } catch (error) {
      throw asPersistenceError('停滞した作成要求の検索に失敗しました', error);
    }
  }
}
// @starter-else
//| // TODO(ex09): better-sqlite3 で RequestRepository を実装する(docs/exercises/09-database.md)
//| // 行(Row)をドメインの RepositoryRequest に変換する関数も自分で書くこと。
//| export class SqliteRequestRepository implements RequestRepository {
//|   constructor(private readonly db: Database.Database) {}
//|
//|   async createOrGet(_input: NewRequest): Promise<{ request: RepositoryRequest; created: boolean }> {
//|     throw new NotImplementedError('09');
//|   }
//|   async findById(_id: string): Promise<RepositoryRequest | null> {
//|     throw new NotImplementedError('09');
//|   }
//|   async list(_filter: ListFilter): Promise<Page<RepositoryRequest>> {
//|     throw new NotImplementedError('09');
//|   }
//|   async transition(
//|     _id: string,
//|     _from: RequestStatus,
//|     _target: TransitionTarget,
//|   ): Promise<RepositoryRequest | null> {
//|     throw new NotImplementedError('09');
//|   }
//|   async findStale(_statuses: readonly RequestStatus[], _olderThan: string): Promise<RepositoryRequest[]> {
//|     throw new NotImplementedError('09');
//|   }
//| }
// @starter-end
