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
import { NotImplementedError } from '../shared/not-implemented.js';

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

// TODO(ex09): better-sqlite3 で RequestRepository を実装する(docs/exercises/09-database.md)
// 行(Row)をドメインの RepositoryRequest に変換する関数も自分で書くこと。
export class SqliteRequestRepository implements RequestRepository {
  constructor(private readonly db: Database.Database) {}

  async createOrGet(_input: NewRequest): Promise<{ request: RepositoryRequest; created: boolean }> {
    throw new NotImplementedError('09');
  }
  async findById(_id: string): Promise<RepositoryRequest | null> {
    throw new NotImplementedError('09');
  }
  async list(_filter: ListFilter): Promise<Page<RepositoryRequest>> {
    throw new NotImplementedError('09');
  }
  async transition(
    _id: string,
    _from: RequestStatus,
    _target: TransitionTarget,
  ): Promise<RepositoryRequest | null> {
    throw new NotImplementedError('09');
  }
  async findStale(
    _statuses: readonly RequestStatus[],
    _olderThan: string,
  ): Promise<RepositoryRequest[]> {
    throw new NotImplementedError('09');
  }
}
