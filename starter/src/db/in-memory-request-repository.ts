import type { RepositoryRequest, RequestStatus } from '../domain/request.js';
import { assertTransition } from '../domain/state-machine.js';
import { sliceToPage } from '../shared/page.js';
import type { Page } from '../shared/page.js';
import { InFlightConflictError } from './request-repository.js';
import type {
  ListFilter,
  NewRequest,
  RequestRepository,
  TransitionTarget,
} from './request-repository.js';
import { NotImplementedError } from '../shared/not-implemented.js';

const IN_FLIGHT: readonly RequestStatus[] = ['PENDING', 'PROCESSING'];

/** テストとDI学習用のインメモリ実装。SQLite版と同じ振る舞いを守る。 */
export class InMemoryRequestRepository implements RequestRepository {
  private readonly byId = new Map<string, RepositoryRequest>();

  // TODO(ex06): Map を使って RequestRepository を実装する(docs/exercises/06-dependency-injection.md)
  async createOrGet(_input: NewRequest): Promise<{ request: RepositoryRequest; created: boolean }> {
    throw new NotImplementedError('06');
  }
  async findById(_id: string): Promise<RepositoryRequest | null> {
    throw new NotImplementedError('06');
  }
  async list(_filter: ListFilter): Promise<Page<RepositoryRequest>> {
    throw new NotImplementedError('06');
  }
  async transition(
    _id: string,
    _from: RequestStatus,
    _target: TransitionTarget,
  ): Promise<RepositoryRequest | null> {
    throw new NotImplementedError('06');
  }
  async findStale(
    _statuses: readonly RequestStatus[],
    _olderThan: string,
  ): Promise<RepositoryRequest[]> {
    throw new NotImplementedError('06');
  }
}
