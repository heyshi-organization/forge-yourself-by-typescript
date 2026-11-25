import { createHash } from 'node:crypto';
import type { RepositorySpec } from './request.js';

/** キー順に依存しない正規化JSON。同じ内容なら常に同じ文字列になる。 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** topicsの並び順だけが違う要求は「同じ要求」とみなす。 */
export function hashSpec(spec: RepositorySpec): string {
  const normalized = { ...spec, topics: [...spec.topics].sort() };
  return createHash('sha256').update(canonicalJson(normalized)).digest('hex');
}
