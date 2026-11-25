import { NotImplementedError } from '../shared/not-implemented.js';
export class TimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`${label} が ${timeoutMs}ms でタイムアウトしました`);
    this.name = 'TimeoutError';
  }
}

// TODO(ex03): AbortController と Promise.race を使って実装する
export async function withTimeout<T>(
  _fn: (signal: AbortSignal) => Promise<T>,
  _ms: number,
  _label = 'operation',
): Promise<T> {
  throw new NotImplementedError('03');
}
