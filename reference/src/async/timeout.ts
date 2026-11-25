export class TimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`${label} が ${timeoutMs}ms でタイムアウトしました`);
    this.name = 'TimeoutError';
  }
}

// @starter-begin ex03
/**
 * fn を実行し、ms を超えたら TimeoutError で reject する。
 * 超過時は fn に渡した signal を abort するので、fn 側(fetchなど)は中断できる。
 * 結果が出た後はタイマーを必ず片付ける(プロセスが終了できなくなるため)。
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new TimeoutError(label, ms);
      controller.abort(error);
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
// @starter-else
//| // TODO(ex03): AbortController と Promise.race を使って実装する
//| export async function withTimeout<T>(
//|   _fn: (signal: AbortSignal) => Promise<T>,
//|   _ms: number,
//|   _label = 'operation',
//| ): Promise<T> {
//|   throw new NotImplementedError('03');
//| }
// @starter-end
