/** ページネーション付き一覧の汎用型。 */
// @starter-begin ex02
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** 要素の型だけを変換し、ページ情報(total/limit/offset)は保つ。 */
export function mapPage<T, U>(page: Page<T>, fn: (item: T) => U): Page<U> {
  return { ...page, items: page.items.map(fn) };
}

/** 配列の一部を切り出して Page にする(インメモリ実装で使う)。 */
export function sliceToPage<T>(all: readonly T[], limit: number, offset: number): Page<T> {
  return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
}
// @starter-else
//| // TODO(ex02): Page<T> を定義する。フィールドは items / total / limit / offset
//| export type Page<T> = any;
//|
//| export function mapPage<T, U>(_page: Page<T>, _fn: (item: T) => U): Page<U> {
//|   throw new NotImplementedError('02');
//| }
//| export function sliceToPage<T>(_all: readonly T[], _limit: number, _offset: number): Page<T> {
//|   throw new NotImplementedError('02');
//| }
// @starter-end
