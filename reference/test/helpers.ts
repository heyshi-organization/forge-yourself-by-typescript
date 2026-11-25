import type { DestinationStream } from 'pino';
import { buildContainer } from '@app/composition.js';
import type { Container } from '@app/composition.js';
import { InMemoryRequestRepository } from '@app/db/in-memory-request-repository.js';
import type { RepositorySpec } from '@app/domain/request.js';
import { FakeGitHubClient } from '@app/github/fake-github-client.js';
import { createLogger } from '@app/logging/logger.js';
import { parseConfig } from '@app/schemas/config.js';
import { ManualClock } from '@app/shared/clock.js';
import { SequentialIds } from '@app/shared/ids.js';

export function makeSpec(overrides: Partial<RepositorySpec> = {}): RepositorySpec {
  return {
    owner: 'acme',
    ownerType: 'organization',
    name: 'demo-repo',
    description: null,
    visibility: 'private',
    autoInit: false,
    topics: [],
    ...overrides,
  };
}

/**
 * ダミーのトークン文字列。実在しない値で、リポジトリ内にトークン形式のリテラルを残さないよう実行時に組み立てる。
 * (Secret Scanning等に誤検知されないため)
 */
export const FAKE_PAT = ['ghp', 'A1b2C3d4E5'.repeat(4)].join('_');
export const FAKE_FINE_GRAINED = ['github', 'pat', 'Zz9Yy8Xx7W'.repeat(4)].join('_');

export const validBody = {
  owner: 'acme',
  ownerType: 'organization',
  name: 'demo-repo',
  visibility: 'private',
} as const;

/** ログをメモリに集める。 */
export function captureLogs(level = 'debug') {
  const lines: Record<string, unknown>[] = [];
  const stream: DestinationStream = {
    write(chunk: string) {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
  return { lines, logger: createLogger(level, stream), raw: () => JSON.stringify(lines) };
}

export interface TestEnv extends Container {
  clock: ManualClock;
  github: FakeGitHubClient;
  logs: ReturnType<typeof captureLogs>;
}

/**
 * アプリ全体(Fastify + SQLite(メモリ) + Fake GitHub)を組み立てる。
 * 待機(sleep)は即時に終わらせ、時計は手動で進める。
 */
export function createTestEnv(
  options: { env?: Record<string, string>; github?: FakeGitHubClient } = {},
): TestEnv {
  const clock = new ManualClock();
  const github = options.github ?? new FakeGitHubClient({ clock, login: 'acme-user' });
  const logs = captureLogs();
  const config = parseConfig({
    GITHUB_CLIENT: 'fake',
    DB_PATH: ':memory:',
    LOG_LEVEL: 'debug',
    GITHUB_TIMEOUT_MS: '200',
    GITHUB_MAX_ATTEMPTS: '3',
    ...options.env,
  });
  const container = buildContainer(config, {
    github,
    clock,
    logger: logs.logger,
    ids: new SequentialIds(),
    sleep: async () => {},
  });
  return { ...container, clock, github, logs };
}

export { InMemoryRequestRepository };

/** Octokit の RequestError に似た形のエラー(分類のテスト用)。 */
export function httpError(
  status: number,
  headers: Record<string, string> = {},
  data: unknown = {},
  message = `HTTP ${status}`,
): Error {
  return Object.assign(new Error(message), { status, response: { headers, data } });
}
