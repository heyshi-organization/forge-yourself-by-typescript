import type { RequestStatus } from './request.js';

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RequestStatus,
    readonly to: RequestStatus,
  ) {
    super(`不正な状態遷移です: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

// @starter-begin ex01
/** 許可される遷移の一覧。ここに無い遷移はすべて不正。 */
export const ALLOWED_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** SUCCEEDED / FAILED は終端状態。 */
export function isTerminal(status: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** switch の網羅性チェック用。到達したらコンパイルエラーで気づける。 */
export function assertNever(value: never): never {
  throw new Error(`到達不能な値です: ${JSON.stringify(value)}`);
}
// @starter-else
//| // TODO(ex01): 状態遷移表を定義する。PENDING -> PROCESSING -> SUCCEEDED | FAILED のみ許可。
//| export const ALLOWED_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
//|   PENDING: [],
//|   PROCESSING: [],
//|   SUCCEEDED: [],
//|   FAILED: [],
//| };
//|
//| export function canTransition(_from: RequestStatus, _to: RequestStatus): boolean {
//|   throw new NotImplementedError('01');
//| }
//|
//| export function isTerminal(_status: RequestStatus): boolean {
//|   throw new NotImplementedError('01');
//| }
//|
//| export function assertTransition(_from: RequestStatus, _to: RequestStatus): void {
//|   throw new NotImplementedError('01');
//| }
//|
//| export function assertNever(_value: never): never {
//|   throw new NotImplementedError('01');
//| }
// @starter-end
