import type { RequestStatus } from './request.js';
import { NotImplementedError } from '../shared/not-implemented.js';

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RequestStatus,
    readonly to: RequestStatus,
  ) {
    super(`不正な状態遷移です: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

// TODO(ex01): 状態遷移表を定義する。PENDING -> PROCESSING -> SUCCEEDED | FAILED のみ許可。
export const ALLOWED_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  PENDING: [],
  PROCESSING: [],
  SUCCEEDED: [],
  FAILED: [],
};

export function canTransition(_from: RequestStatus, _to: RequestStatus): boolean {
  throw new NotImplementedError('01');
}

export function isTerminal(_status: RequestStatus): boolean {
  throw new NotImplementedError('01');
}

export function assertTransition(_from: RequestStatus, _to: RequestStatus): void {
  throw new NotImplementedError('01');
}

export function assertNever(_value: never): never {
  throw new NotImplementedError('01');
}
