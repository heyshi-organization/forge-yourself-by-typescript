import { NotImplementedError } from './not-implemented.js';
/** ページネーション付き一覧の汎用型。 */
// TODO(ex02): Page<T> を定義する。フィールドは items / total / limit / offset
export type Page<T> = any;

export function mapPage<T, U>(_page: Page<T>, _fn: (item: T) => U): Page<U> {
  throw new NotImplementedError('02');
}
export function sliceToPage<T>(_all: readonly T[], _limit: number, _offset: number): Page<T> {
  throw new NotImplementedError('02');
}
