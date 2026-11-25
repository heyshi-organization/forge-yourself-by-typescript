import { sleep } from '../async/sleep.js';
import { systemClock } from '../shared/clock.js';
import type { Clock } from '../shared/clock.js';
import type { GitHubRepositoryInfo, RepositorySpec } from '../domain/request.js';
import { GitHubApiError } from './errors.js';
import type { GitHubErrorKind } from './errors.js';
import type { CallOptions, GitHubClient } from './types.js';

type Operation = 'createRepository' | 'getRepository' | 'replaceTopics' | 'getAuthenticatedLogin';

/** 次の呼び出しで起こしたい挙動。 */
export type Behavior =
  /** 何もせず失敗する */
  | { readonly type: 'fail'; readonly error: unknown }
  /** 副作用(リポジトリ作成)は成功したが、呼び出し側には失敗(タイムアウト等)に見える */
  | { readonly type: 'succeed-then-fail'; readonly error: unknown }
  /** 応答しない。signal が abort されたら中断される */
  | { readonly type: 'hang' };

export interface FakeGitHubOptions {
  readonly clock?: Clock;
  readonly login?: string;
  /** true の場合、"simulate-<kind>" で始まる名前で対応する失敗を再現する(ローカル動作確認用)。 */
  readonly simulateByName?: boolean;
  /** 各呼び出しの擬似的な遅延。 */
  readonly latencyMs?: number;
}

interface StoredRepo extends GitHubRepositoryInfo {
  topics: string[];
}

/**
 * GitHubClient のインメモリ実装。テストとローカル動作確認に使う。
 * 実際のGitHubには一切接続しない。
 */
export class FakeGitHubClient implements GitHubClient {
  readonly repos = new Map<string, StoredRepo>();
  readonly calls: { operation: Operation; args: unknown[] }[] = [];
  private readonly behaviors = new Map<Operation, Behavior[]>();
  private nextId = 1000;
  private readonly clock: Clock;
  private readonly login: string;

  constructor(private readonly options: FakeGitHubOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.login = options.login ?? 'fake-user';
  }

  /** 指定した操作の次の呼び出しから順に、挙動を差し込む。 */
  enqueue(operation: Operation, ...behaviors: Behavior[]): this {
    this.behaviors.set(operation, [...(this.behaviors.get(operation) ?? []), ...behaviors]);
    return this;
  }

  countCalls(operation: Operation): number {
    return this.calls.filter((c) => c.operation === operation).length;
  }

  private key(owner: string, name: string): string {
    return `${owner}/${name}`.toLowerCase();
  }

  private async begin(
    operation: Operation,
    args: unknown[],
    options?: CallOptions,
  ): Promise<Behavior | undefined> {
    this.calls.push({ operation, args });
    if (this.options.latencyMs) await sleep(this.options.latencyMs, options?.signal);
    const behavior = this.behaviors.get(operation)?.shift();
    if (behavior?.type === 'fail') throw behavior.error;
    if (behavior?.type === 'hang') {
      await new Promise<never>((_, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) reject(signal.reason);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
    return behavior;
  }

  async createRepository(
    spec: RepositorySpec,
    options?: CallOptions,
  ): Promise<GitHubRepositoryInfo> {
    const behavior = await this.begin('createRepository', [spec], options);
    this.simulateByName(spec.name);

    const key = this.key(spec.owner, spec.name);
    if (this.repos.has(key)) {
      throw new GitHubApiError('conflict', 'name already exists on this account', { status: 422 });
    }
    const repo: StoredRepo = {
      id: this.nextId++,
      fullName: `${spec.owner}/${spec.name}`,
      htmlUrl: `https://github.com/${spec.owner}/${spec.name}`,
      createdAt: this.clock.now().toISOString(),
      topics: [],
    };
    this.repos.set(key, repo);

    if (behavior?.type === 'succeed-then-fail') throw behavior.error;
    return this.toInfo(repo);
  }

  async getRepository(
    owner: string,
    name: string,
    options?: CallOptions,
  ): Promise<GitHubRepositoryInfo | null> {
    await this.begin('getRepository', [owner, name], options);
    const repo = this.repos.get(this.key(owner, name));
    return repo ? this.toInfo(repo) : null;
  }

  async replaceTopics(
    owner: string,
    name: string,
    topics: readonly string[],
    options?: CallOptions,
  ): Promise<void> {
    await this.begin('replaceTopics', [owner, name, topics], options);
    const repo = this.repos.get(this.key(owner, name));
    if (!repo) throw new GitHubApiError('not_found', 'Not Found', { status: 404 });
    repo.topics = [...topics];
  }

  async getAuthenticatedLogin(options?: CallOptions): Promise<string> {
    await this.begin('getAuthenticatedLogin', [], options);
    return this.login;
  }

  topicsOf(owner: string, name: string): readonly string[] | undefined {
    return this.repos.get(this.key(owner, name))?.topics;
  }

  private toInfo(repo: StoredRepo): GitHubRepositoryInfo {
    return {
      id: repo.id,
      fullName: repo.fullName,
      htmlUrl: repo.htmlUrl,
      createdAt: repo.createdAt,
    };
  }

  /** ローカル動作確認用。例: name が "simulate-rate-limit" → レート制限エラー。 */
  private simulateByName(name: string): void {
    if (!this.options.simulateByName || !name.startsWith('simulate-')) return;
    const kinds: Record<string, [GitHubErrorKind, number?]> = {
      'simulate-auth': ['auth', 401],
      'simulate-permission': ['permission', 403],
      'simulate-rate-limit': ['rate_limit', 429],
      'simulate-unavailable': ['unavailable', 503],
      'simulate-timeout': ['timeout'],
    };
    const hit = kinds[name];
    if (hit) {
      const [kind, status] = hit;
      throw new GitHubApiError(kind, `simulated ${kind}`, status === undefined ? {} : { status });
    }
  }
}
