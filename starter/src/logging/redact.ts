import { NotImplementedError } from '../shared/not-implemented.js';
const MAX_DEPTH = 8;
const REDACTED = '[REDACTED]';

// TODO(ex08): 秘密情報をログに出さないための関数を実装する(docs/exercises/08-error-handling.md)
export function redactString(_value: string): string {
  throw new NotImplementedError('08');
}

export function redactSecrets(_value: unknown, _depth = 0, _seen = new WeakSet<object>()): unknown {
  throw new NotImplementedError('08');
}

export { REDACTED, MAX_DEPTH };
