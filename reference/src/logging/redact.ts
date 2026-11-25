const MAX_DEPTH = 8;
const REDACTED = '[REDACTED]';

// @starter-begin ex08
/** 値そのものが秘密情報の形をしているもの(GitHubのトークン、Bearer、URL内の認証情報)。 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\b(Bearer|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/g,
];

/** キー名から「中身を見ずに隠すべき」と判断するもの。 */
const SECRET_KEY_PATTERN =
  /token|secret|password|passwd|authorization|api[-_]?key|cookie|private[-_]?key/i;

export function redactString(value: string): string {
  return SECRET_VALUE_PATTERNS.reduce(
    (acc, pattern) =>
      acc.replace(pattern, (_m, prefix: unknown) =>
        typeof prefix === 'string' && prefix.startsWith('http')
          ? `${prefix}${REDACTED}@`
          : REDACTED,
      ),
    value,
  );
}

/**
 * ログに出す値から秘密情報を除いたコピーを返す(元の値は変更しない)。
 * - キー名が SECRET_KEY_PATTERN に一致する値は丸ごと隠す
 * - 文字列は SECRET_VALUE_PATTERNS に一致する部分を隠す
 * - Error は name / message / stack(を処理したもの)と cause を辿る
 * - 循環参照と深すぎる階層で止まる
 */
export function redactSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.stack === undefined ? {} : { stack: redactString(value.stack) }),
      ...(value.cause === undefined ? {} : { cause: redactSecrets(value.cause, depth + 1, seen) }),
    };
  }
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactSecrets(v, depth + 1, seen);
  }
  return out;
}
// @starter-else
//| // TODO(ex08): 秘密情報をログに出さないための関数を実装する(docs/exercises/08-error-handling.md)
//| export function redactString(_value: string): string {
//|   throw new NotImplementedError('08');
//| }
//|
//| export function redactSecrets(_value: unknown, _depth = 0, _seen = new WeakSet<object>()): unknown {
//|   throw new NotImplementedError('08');
//| }
// @starter-end

export { REDACTED, MAX_DEPTH };
