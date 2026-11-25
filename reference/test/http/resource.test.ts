import { describe, expect, it } from 'vitest';
import type { RepositoryRequest } from '@app/domain/request.js';
import { toRequestResource } from '@app/http/resource.js';
import { makeSpec } from '@test/helpers.js';

const base = {
  id: 'r1',
  idempotencyKey: 'k',
  requestHash: 'h',
  spec: makeSpec({ topics: ['a'] }),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:01.000Z',
};

describe('toRequestResource: 状態ごとに公開する項目が変わる', () => {
  it('PENDING: 開始・終了・結果はすべて null', () => {
    const r = toRequestResource({ ...base, status: 'PENDING' });
    expect(r).toMatchObject({
      status: 'PENDING',
      startedAt: null,
      finishedAt: null,
      repository: null,
      error: null,
      warnings: [],
    });
  });
  it('PROCESSING: startedAt だけ持つ', () => {
    const r = toRequestResource({
      ...base,
      status: 'PROCESSING',
      startedAt: '2026-01-01T00:00:01.000Z',
    });
    expect(r).toMatchObject({ startedAt: '2026-01-01T00:00:01.000Z', finishedAt: null });
  });
  it('SUCCEEDED: repository を持ち、内部用の createdAt(GitHub側)は出さない', () => {
    const req: RepositoryRequest = {
      ...base,
      status: 'SUCCEEDED',
      startedAt: 's',
      finishedAt: 'f',
      repository: { id: 1, fullName: 'a/b', htmlUrl: 'https://github.com/a/b', createdAt: 'x' },
      warnings: ['TOPICS_NOT_APPLIED'],
    };
    const r = toRequestResource(req);
    expect(r.repository).toEqual({ id: 1, fullName: 'a/b', htmlUrl: 'https://github.com/a/b' });
    expect(r.warnings).toEqual(['TOPICS_NOT_APPLIED']);
  });
  it('どの状態でも idempotencyKey と requestHash は公開しない', () => {
    const r = toRequestResource({ ...base, status: 'PENDING' });
    expect(JSON.stringify(r)).not.toMatch(/idempotencyKey|requestHash/);
  });
});
