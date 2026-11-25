import { z } from 'zod';
import './setup.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

// @starter-begin ex04
const envSchema = z
  .object({
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    /** 明示しない限りループバック以外にはバインドしない。 */
    ALLOW_PUBLIC_BIND: z.enum(['true', 'false']).default('false'),
    DB_PATH: z.string().min(1).default('./data/app.sqlite'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    GITHUB_CLIENT: z.enum(['octokit', 'fake']).default('octokit'),
    GITHUB_TOKEN: z.string().min(1).optional(),
    GITHUB_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
    GITHUB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
    PROCESSING_LEASE_MS: z.coerce.number().int().min(1_000).default(300_000),
  })
  .superRefine((env, ctx) => {
    if (env.GITHUB_CLIENT === 'octokit' && !env.GITHUB_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['GITHUB_TOKEN'],
        message: 'octokit では GITHUB_TOKEN が必須です',
      });
    }
    if (!LOOPBACK_HOSTS.has(env.HOST) && env.ALLOW_PUBLIC_BIND !== 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['HOST'],
        message: 'ループバック以外にバインドするには ALLOW_PUBLIC_BIND=true が必要です',
      });
    }
  });

export interface AppConfig {
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly githubClient: 'octokit' | 'fake';
  /** 秘密情報。ログやエラーに出さないこと。 */
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

/** 環境変数から設定を読む。値は含めず、どの変数が悪いかだけをエラーにする。 */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const e = parsed.data;
  return {
    host: e.HOST,
    port: e.PORT,
    dbPath: e.DB_PATH,
    logLevel: e.LOG_LEVEL,
    githubClient: e.GITHUB_CLIENT,
    githubToken: e.GITHUB_TOKEN,
    githubTimeoutMs: e.GITHUB_TIMEOUT_MS,
    githubMaxAttempts: e.GITHUB_MAX_ATTEMPTS,
    processingLeaseMs: e.PROCESSING_LEASE_MS,
  };
}
// @starter-else
//| // TODO(ex04): 環境変数のスキーマを定義し、parseConfig を実装する(仕様は課題文を参照)
//| export interface AppConfig {
//|   readonly host: string;
//|   readonly port: number;
//|   readonly dbPath: string;
//|   readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
//|   readonly githubClient: 'octokit' | 'fake';
//|   readonly githubToken: string | undefined;
//|   readonly githubTimeoutMs: number;
//|   readonly githubMaxAttempts: number;
//|   readonly processingLeaseMs: number;
//| }
//|
//| export class ConfigError extends Error {
//|   constructor(readonly issues: readonly string[]) {
//|     super(`設定が不正です:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
//|     this.name = 'ConfigError';
//|   }
//| }
//|
//| export function parseConfig(_env: Record<string, string | undefined>): AppConfig {
//|   throw new NotImplementedError('04');
//| }
// @starter-end
