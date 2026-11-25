import { z } from 'zod';
import './setup.js';
import { NotImplementedError } from '../shared/not-implemented.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

// TODO(ex04): 環境変数のスキーマを定義し、parseConfig を実装する(仕様は課題文を参照)
export interface AppConfig {
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly githubClient: 'octokit' | 'fake';
  readonly githubToken: string | undefined;
  readonly githubTimeoutMs: number;
  readonly githubMaxAttempts: number;
  readonly processingLeaseMs: number;
}

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`設定が不正です:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function parseConfig(_env: Record<string, string | undefined>): AppConfig {
  throw new NotImplementedError('04');
}
