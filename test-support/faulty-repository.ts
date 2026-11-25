import { PersistenceError } from '@app/db/request-repository.js';
import type {
  ListFilter,
  NewRequest,
  RequestRepository,
  TransitionTarget,
} from '@app/db/request-repository.js';
import type { RequestStatus } from '@app/domain/request.js';

/** 指定した操作を、指定回数だけ失敗させるリポジトリ(DB障害の再現用)。 */
export class FaultyRepository implements RequestRepository {
  private readonly failures: { method: string; to?: RequestStatus; error: Error }[] = [];
  constructor(private readonly inner: RequestRepository) {}
  failNext(method: string, error = new PersistenceError('disk full'), to?: RequestStatus): void {
    this.failures.push({ method, error, ...(to === undefined ? {} : { to }) });
  }
  private check(method: string, to?: RequestStatus): void {
    const i = this.failures.findIndex(
      (f) => f.method === method && (f.to === undefined || f.to === to),
    );
    const failure = i >= 0 ? this.failures.splice(i, 1)[0] : undefined;
    if (failure) throw failure.error;
  }
  createOrGet(input: NewRequest) {
    this.check('createOrGet');
    return this.inner.createOrGet(input);
  }
  findById(id: string) {
    this.check('findById');
    return this.inner.findById(id);
  }
  list(filter: ListFilter) {
    return this.inner.list(filter);
  }
  transition(id: string, from: RequestStatus, target: TransitionTarget) {
    this.check('transition', target.to);
    return this.inner.transition(id, from, target);
  }
  findStale(statuses: readonly RequestStatus[], olderThan: string) {
    this.check('findStale');
    return this.inner.findStale(statuses, olderThan);
  }
}
