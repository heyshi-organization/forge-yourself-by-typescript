import { beforeEach, describe, expect, it } from 'vitest';
import { FakeGitHubClient } from '@app/github/fake-github-client.js';
import { ResilientProvisioner } from '@app/provisioning/resilient-provisioner.js';
import type { ProvisionContext } from '@app/provisioning/types.js';
import { ManualClock } from '@app/shared/clock.js';
import { captureLogs, httpError, makeSpec } from '../helpers.js';

let clock: ManualClock;
let github: FakeGitHubClient;
let sleeps: number[];
let logs: ReturnType<typeof captureLogs>;
let provisioner: ResilientProvisioner;
let ctx: ProvisionContext;

beforeEach(() => {
  clock = new ManualClock();
  github = new FakeGitHubClient({ clock, login: 'acme-user' });
  sleeps = [];
  logs = captureLogs();
  provisioner = new ResilientProvisioner({
    github,
    timeoutMs: 50,
    retryPolicy: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
  });
  ctx = { requestId: 'r1', startedAt: clock.now().toISOString(), logger: logs.logger };
});

const conflict = () =>
  httpError(422, {}, { errors: [{ message: 'name already exists on this account' }] });

describe('provision: 正常系', () => {
  it('リポジトリを作成し、情報を返す', async () => {
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r).toMatchObject({
      ok: true,
      value: { repository: { fullName: 'acme/demo-repo' }, warnings: [] },
    });
    expect(github.countCalls('createRepository')).toBe(1);
  });

  it('topics があれば設定する', async () => {
    await provisioner.provision(makeSpec({ topics: ['a', 'b'] }), ctx);
    expect(github.topicsOf('acme', 'demo-repo')).toEqual(['a', 'b']);
  });

  it('topics の設定に失敗しても、リポジトリは作成済みなので成功(警告つき)', async () => {
    github.enqueue(
      'replaceTopics',
      ...Array.from({ length: 3 }, () => ({ type: 'fail' as const, error: httpError(503) })),
    );
    const r = await provisioner.provision(makeSpec({ topics: ['a'] }), ctx);
    expect(r).toMatchObject({ ok: true, value: { warnings: ['TOPICS_NOT_APPLIED'] } });
  });

  it('ownerType=user は認証ユーザーと一致すれば作成できる', async () => {
    const r = await provisioner.provision(makeSpec({ ownerType: 'user', owner: 'ACME-user' }), ctx);
    expect(r.ok).toBe(true);
  });
});

describe('provision: 失敗(再試行しない)', () => {
  it('ownerType=user で owner が違う → OWNER_MISMATCH。作成は呼ばれない', async () => {
    const r = await provisioner.provision(
      makeSpec({ ownerType: 'user', owner: 'someone-else' }),
      ctx,
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'OWNER_MISMATCH' } });
    expect(github.countCalls('createRepository')).toBe(0);
  });

  it.each([
    ['認証エラー', httpError(401), 'GITHUB_AUTH_FAILED'],
    ['権限不足', httpError(403, {}, {}, 'Resource not accessible'), 'GITHUB_PERMISSION_DENIED'],
    ['名前の重複', conflict(), 'REPOSITORY_ALREADY_EXISTS'],
    ['GitHubが内容を拒否', httpError(422, {}, { errors: [{ message: 'bad' }] }), 'GITHUB_REJECTED'],
  ])('%s は1回で諦める', async (_label, error, code) => {
    github.enqueue('createRepository', { type: 'fail', error });
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r).toMatchObject({ ok: false, error: { code } });
    expect(github.countCalls('createRepository')).toBe(1);
    expect(sleeps).toEqual([]);
  });
});

describe('provision: リトライ', () => {
  it('一時的な障害(503)は再試行して回復する。待ち時間は指数バックオフ', async () => {
    github.enqueue(
      'createRepository',
      { type: 'fail', error: httpError(503) },
      { type: 'fail', error: httpError(502) },
    );
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r.ok).toBe(true);
    expect(github.countCalls('createRepository')).toBe(3);
    expect(sleeps).toEqual([50, 100]); // random=0.5 → 100*2^0*0.5, 100*2^1*0.5
  });

  it('回数を使い切ったら GITHUB_UNAVAILABLE', async () => {
    github.enqueue(
      'createRepository',
      ...Array.from({ length: 5 }, () => ({ type: 'fail' as const, error: httpError(503) })),
    );
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'GITHUB_UNAVAILABLE' } });
    expect(github.countCalls('createRepository')).toBe(3);
  });

  it('レート制限は Retry-After の分だけ待って再試行する', async () => {
    github.enqueue('createRepository', {
      type: 'fail',
      error: httpError(429, { 'retry-after': '1' }),
    });
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r.ok).toBe(true);
    expect(sleeps).toEqual([1000]);
  });

  it('待ち時間が長すぎるレート制限は、待たずに GITHUB_RATE_LIMITED', async () => {
    github.enqueue('createRepository', {
      type: 'fail',
      error: httpError(429, { 'retry-after': '3600' }),
    });
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'GITHUB_RATE_LIMITED' } });
    expect(github.countCalls('createRepository')).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('応答しない相手には、タイムアウトして GITHUB_TIMEOUT', async () => {
    github.enqueue(
      'createRepository',
      ...Array.from({ length: 3 }, () => ({ type: 'hang' as const })),
    );
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'GITHUB_TIMEOUT' } });
    expect(github.countCalls('createRepository')).toBe(3);
  });
});

describe('provision: 結果が分からない失敗(重複作成の防止)', () => {
  it('タイムアウトしたが実は作成済み → 再試行の conflict を「自分が作った」と判定して成功', async () => {
    github.enqueue('createRepository', { type: 'succeed-then-fail', error: httpError(503) });
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r).toMatchObject({ ok: true, value: { repository: { fullName: 'acme/demo-repo' } } });
    expect(github.repos.size).toBe(1);
    expect(logs.raw()).toContain('作成済みと判断');
  });

  it('以前から存在した同名リポジトリは「自分が作った」とは判定しない', async () => {
    await github.createRepository(makeSpec()); // T0 に作成
    clock.advance(60 * 60 * 1000);
    ctx = { ...ctx, startedAt: clock.now().toISOString() };
    github.enqueue('createRepository', { type: 'fail', error: httpError(503) }); // 結果不明の失敗
    const r = await provisioner.provision(makeSpec(), ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'REPOSITORY_ALREADY_EXISTS' } });
  });

  it('曖昧な失敗が続いて諦めた場合も、最後に1回だけ作成済みか確認する', async () => {
    github.enqueue(
      'createRepository',
      { type: 'succeed-then-fail', error: httpError(503) },
      // 2回目以降は到達前に失敗(conflictを見ない)ケースを作る
      { type: 'fail', error: httpError(503) },
      { type: 'fail', error: httpError(503) },
    );
    const r = await provisioner.provision(makeSpec(), ctx);
    // 2回目の試行は conflict ではなく 503 → 3回目も 503 → 諦め → 最終確認で発見
    expect(r.ok).toBe(true);
    expect(github.countCalls('getRepository')).toBe(1);
  });
});

describe('reconcile', () => {
  it('今回の処理で作られたリポジトリがあれば成功にする', async () => {
    await github.createRepository(makeSpec());
    const r = await provisioner.reconcile(makeSpec({ topics: ['x'] }), ctx);
    expect(r.ok).toBe(true);
    expect(github.topicsOf('acme', 'demo-repo')).toEqual(['x']);
  });
  it('存在しなければ INTERRUPTED', async () => {
    expect(await provisioner.reconcile(makeSpec(), ctx)).toMatchObject({
      ok: false,
      error: { code: 'INTERRUPTED' },
    });
  });
  it('以前からあるリポジトリなら REPOSITORY_ALREADY_EXISTS', async () => {
    await github.createRepository(makeSpec());
    clock.advance(24 * 60 * 60 * 1000);
    const r = await provisioner.reconcile(makeSpec(), {
      ...ctx,
      startedAt: clock.now().toISOString(),
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'REPOSITORY_ALREADY_EXISTS' } });
  });
  it('GitHubが落ちていれば GITHUB_UNAVAILABLE(要求は PROCESSING のまま残せる)', async () => {
    github.enqueue(
      'getRepository',
      ...Array.from({ length: 3 }, () => ({ type: 'fail' as const, error: httpError(503) })),
    );
    expect(await provisioner.reconcile(makeSpec(), ctx)).toMatchObject({
      ok: false,
      error: { code: 'GITHUB_UNAVAILABLE' },
    });
  });
});

describe('ログ', () => {
  it('試行ごとに operation / attempt / outcome / durationMs を構造化ログに出す', async () => {
    github.enqueue('createRepository', { type: 'fail', error: httpError(503) });
    await provisioner.provision(makeSpec(), ctx);
    const calls = logs.lines.filter((l) => l.operation === 'createRepository' && l.outcome);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      attempt: 1,
      outcome: 'error',
      kind: 'unavailable',
      status: 503,
      requestId: 'r1',
    });
    expect(calls[1]).toMatchObject({ attempt: 2, outcome: 'ok' });
    expect(typeof calls[1]?.durationMs).toBe('number');
  });
});
