import { NotImplementedError } from './not-implemented.js';
/**
 * 成功(Ok)か失敗(Err)かを「値」として表す型。
 * 例外と違い、失敗しうることが関数のシグネチャに現れる。
 */
// TODO(ex02): Result<T, E> を判別可能なUnion型として定義する(docs/exercises/02-generics.md)
// 暫定のany。型を定義したら削除すること。
export type Result<T, E> = any;

export function ok<T>(_value: T): Result<T, never> {
  throw new NotImplementedError('02');
}
export function err<E>(_error: E): Result<never, E> {
  throw new NotImplementedError('02');
}
export function map<T, U, E>(_result: Result<T, E>, _fn: (value: T) => U): Result<U, E> {
  throw new NotImplementedError('02');
}
export function mapErr<T, E, F>(_result: Result<T, E>, _fn: (error: E) => F): Result<T, F> {
  throw new NotImplementedError('02');
}
export function flatMap<T, U, E, F>(
  _result: Result<T, E>,
  _fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  throw new NotImplementedError('02');
}
export function unwrapOr<T, E>(_result: Result<T, E>, _fallback: T): T {
  throw new NotImplementedError('02');
}
export function collect<T, E>(_results: readonly Result<T, E>[]): Result<T[], E> {
  throw new NotImplementedError('02');
}
export function fromPromise<T>(_promise: Promise<T>): Promise<Result<T, unknown>> {
  throw new NotImplementedError('02');
}
