import { NotImplementedError } from '../shared/not-implemented.js';
// TODO(ex03): ワーカーを limit 個だけ起動して、共有のインデックスから順に取り出す方式で実装する
export async function mapWithConcurrency<T, U>(
  _items: readonly T[],
  _limit: number,
  _fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  throw new NotImplementedError('03');
}
