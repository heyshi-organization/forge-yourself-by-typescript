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
import { NotImplementedError } from './shared/not-implemented.js';

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

// TODO(ex06): 依存関係を組み立てる(docs/exercises/06-dependency-injection.md)
export function buildContainer(_config: AppConfig, _overrides: Overrides = {}): Container {
  throw new NotImplementedError('06');
}
