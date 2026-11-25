import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { openDatabase } from './db/database.js';
import { SqliteRequestRepository } from './db/sqlite-request-repository.js';
import { FakeGitHubClient } from './github/fake-github-client.js';
import { OctokitGitHubClient } from './github/octokit-client.js';
import type { GitHubClient } from './github/types.js';
import type { RequestRepository } from './db/request-repository.js';
import type { RepositoryProvisioner } from './provisioning/types.js';
import { buildApp } from './http/app.js';
import { createLogger } from './logging/logger.js';
import type { AppLogger } from './logging/logger.js';
import { ResilientProvisioner } from './provisioning/resilient-provisioner.js';
import type { AppConfig } from './schemas/config.js';
import { ProvisioningService } from './services/provisioning-service.js';
import { systemClock } from './shared/clock.js';
import type { Clock } from './shared/clock.js';
import { uuidGenerator } from './shared/ids.js';
import type { IdGenerator } from './shared/ids.js';

/** テストなどで差し替えたい依存。指定しなければ設定に従った本番用の実装を使う。 */
export interface Overrides {
  readonly github?: GitHubClient;
  readonly requests?: RequestRepository;
  readonly provisioner?: RepositoryProvisioner;
  readonly logger?: AppLogger;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface Container {
  readonly app: FastifyInstance;
  readonly service: ProvisioningService;
  /** requests を差し替えた場合は SQLite を開かないので null。 */
  readonly db: Database.Database | null;
  close(): Promise<void>;
}

// @starter-begin ex06
/**
 * Composition Root: 依存関係を組み立てる唯一の場所。
 * 他のファイルは `new` で具体的な実装を作らず、必要なものを引数で受け取る。
 */
export function buildContainer(config: AppConfig, overrides: Overrides = {}): Container {
  const logger = overrides.logger ?? createLogger(config.logLevel);
  const clock = overrides.clock ?? systemClock;

  const db = overrides.requests ? null : openDatabase(config.dbPath);
  const requests = overrides.requests ?? new SqliteRequestRepository(db as Database.Database);

  const provisioner =
    overrides.provisioner ??
    new ResilientProvisioner({
      github: overrides.github ?? createGitHubClient(config, clock),
      timeoutMs: config.githubTimeoutMs,
      retryPolicy: { maxAttempts: config.githubMaxAttempts, baseDelayMs: 500, maxDelayMs: 10_000 },
      ...(overrides.sleep ? { sleep: overrides.sleep } : {}),
    });

  const service = new ProvisioningService({
    requests,
    provisioner,
    clock,
    ids: overrides.ids ?? uuidGenerator,
    logger,
    leaseMs: config.processingLeaseMs,
  });
  const app = buildApp({ service, logger });

  return {
    app,
    service,
    db,
    async close() {
      await app.close();
      db?.close();
    },
  };
}

function createGitHubClient(config: AppConfig, clock: Clock): GitHubClient {
  return config.githubClient === 'fake'
    ? new FakeGitHubClient({ clock, simulateByName: true })
    : new OctokitGitHubClient({ token: config.githubToken ?? '' });
}
// @starter-else
//| // TODO(ex06): 依存関係を組み立てる(docs/exercises/06-dependency-injection.md)
//| export function buildContainer(_config: AppConfig, _overrides: Overrides = {}): Container {
//|   throw new NotImplementedError('06');
//| }
// @starter-end
