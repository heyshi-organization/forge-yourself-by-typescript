/**
 * 成功(Ok)か失敗(Err)かを「値」として表す型。
 * 例外と違い、失敗しうることが関数のシグネチャに現れる。
 */
// @starter-begin ex02
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

export function flatMap<T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? fn(result.value) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** 最初に見つかったErrを返す。全部Okなら値の配列を返す。 */
export function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}

/** 例外を投げうる非同期処理を Result に変換する。 */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, unknown>> {
  try {
    return ok(await promise);
  } catch (error) {
    return err(error);
  }
}
// @starter-else
//| // TODO(ex02): Result<T, E> を判別可能なUnion型として定義する(docs/exercises/02-generics.md)
//| // 暫定のany。型を定義したら削除すること。
//| export type Result<T, E> = any;
//|
//| export function ok<T>(_value: T): Result<T, never> {
//|   throw new NotImplementedError('02');
//| }
//| export function err<E>(_error: E): Result<never, E> {
//|   throw new NotImplementedError('02');
//| }
//| export function map<T, U, E>(_result: Result<T, E>, _fn: (value: T) => U): Result<U, E> {
//|   throw new NotImplementedError('02');
//| }
//| export function mapErr<T, E, F>(_result: Result<T, E>, _fn: (error: E) => F): Result<T, F> {
//|   throw new NotImplementedError('02');
//| }
//| export function flatMap<T, U, E, F>(
//|   _result: Result<T, E>,
//|   _fn: (value: T) => Result<U, F>,
//| ): Result<U, E | F> {
//|   throw new NotImplementedError('02');
//| }
//| export function unwrapOr<T, E>(_result: Result<T, E>, _fallback: T): T {
//|   throw new NotImplementedError('02');
//| }
//| export function collect<T, E>(_results: readonly Result<T, E>[]): Result<T[], E> {
//|   throw new NotImplementedError('02');
//| }
//| export function fromPromise<T>(_promise: Promise<T>): Promise<Result<T, unknown>> {
//|   throw new NotImplementedError('02');
//| }
// @starter-end
