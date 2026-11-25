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

const IN_FLIGHT: readonly RequestStatus[] = ['PENDING', 'PROCESSING'];

/** テストとDI学習用のインメモリ実装。SQLite版と同じ振る舞いを守る。 */
export class InMemoryRequestRepository implements RequestRepository {
  private readonly byId = new Map<string, RepositoryRequest>();

  // @starter-begin ex06
  async createOrGet(input: NewRequest): Promise<{ request: RepositoryRequest; created: boolean }> {
    for (const existing of this.byId.values()) {
      if (existing.idempotencyKey === input.idempotencyKey)
        return { request: existing, created: false };
    }
    const sameRepo = [...this.byId.values()].some(
      (r) =>
        IN_FLIGHT.includes(r.status) &&
        r.spec.owner.toLowerCase() === input.spec.owner.toLowerCase() &&
        r.spec.name.toLowerCase() === input.spec.name.toLowerCase(),
    );
    if (sameRepo) throw new InFlightConflictError();

    const request: RepositoryRequest = {
      id: input.id,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      spec: input.spec,
      status: 'PENDING',
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.byId.set(request.id, request);
    return { request, created: true };
  }

  async findById(id: string): Promise<RepositoryRequest | null> {
    return this.byId.get(id) ?? null;
  }

  async list(filter: ListFilter): Promise<Page<RepositoryRequest>> {
    const all = [...this.byId.values()]
      .filter((r) => filter.status === undefined || r.status === filter.status)
      .sort((a, b) =>
        a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
      );
    return sliceToPage(all, filter.limit, filter.offset);
  }

  async transition(
    id: string,
    from: RequestStatus,
    target: TransitionTarget,
  ): Promise<RepositoryRequest | null> {
    const current = this.byId.get(id);
    if (!current || current.status !== from) return null;
    assertTransition(from, target.to);

    const base = {
      id: current.id,
      idempotencyKey: current.idempotencyKey,
      requestHash: current.requestHash,
      spec: current.spec,
      createdAt: current.createdAt,
      updatedAt: target.now,
    };
    const startedAt = 'startedAt' in current ? current.startedAt : target.now;
    let next: RepositoryRequest;
    switch (target.to) {
      case 'PROCESSING':
        next = { ...base, status: 'PROCESSING', startedAt: target.now };
        break;
      case 'SUCCEEDED':
        next = {
          ...base,
          status: 'SUCCEEDED',
          startedAt,
          finishedAt: target.now,
          repository: target.repository,
          warnings: target.warnings,
        };
        break;
      case 'FAILED':
        next = {
          ...base,
          status: 'FAILED',
          startedAt,
          finishedAt: target.now,
          error: target.error,
        };
        break;
    }
    this.byId.set(id, next);
    return next;
  }

  async findStale(
    statuses: readonly RequestStatus[],
    olderThan: string,
  ): Promise<RepositoryRequest[]> {
    return [...this.byId.values()].filter(
      (r) => statuses.includes(r.status) && r.updatedAt < olderThan,
    );
  }
  // @starter-else
  //|   // TODO(ex06): Map を使って RequestRepository を実装する(docs/exercises/06-dependency-injection.md)
  //|   async createOrGet(_input: NewRequest): Promise<{ request: RepositoryRequest; created: boolean }> {
  //|     throw new NotImplementedError('06');
  //|   }
  //|   async findById(_id: string): Promise<RepositoryRequest | null> {
  //|     throw new NotImplementedError('06');
  //|   }
  //|   async list(_filter: ListFilter): Promise<Page<RepositoryRequest>> {
  //|     throw new NotImplementedError('06');
  //|   }
  //|   async transition(
  //|     _id: string,
  //|     _from: RequestStatus,
  //|     _target: TransitionTarget,
  //|   ): Promise<RepositoryRequest | null> {
  //|     throw new NotImplementedError('06');
  //|   }
  //|   async findStale(_statuses: readonly RequestStatus[], _olderThan: string): Promise<RepositoryRequest[]> {
  //|     throw new NotImplementedError('06');
  //|   }
  // @starter-end
}
