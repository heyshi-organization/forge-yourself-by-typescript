// @starter-begin ex03
/**
 * items を最大 limit 個ずつ並行に処理する。結果は入力と同じ順序で返す。
 * どれか1つでも reject したら、全体も reject する(新しい要素の開始はそれ以降行わない)。
 */
export async function mapWithConcurrency<T, U>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit は1以上の整数');
  const results = new Array<U>(items.length);
  let next = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
// @starter-else
//| // TODO(ex03): ワーカーを limit 個だけ起動して、共有のインデックスから順に取り出す方式で実装する
//| export async function mapWithConcurrency<T, U>(
//|   _items: readonly T[],
//|   _limit: number,
//|   _fn: (item: T, index: number) => Promise<U>,
//| ): Promise<U[]> {
//|   throw new NotImplementedError('03');
//| }
// @starter-end
