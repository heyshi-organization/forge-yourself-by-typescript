import { Octokit } from '@octokit/rest';
import type { GitHubRepositoryInfo, RepositorySpec } from '../domain/request.js';
import { classifyGitHubError } from './classify.js';
import type { CallOptions, GitHubClient } from './types.js';

export interface OctokitClientOptions {
  /** 秘密情報。このクラスの外にはログ出力しない。 */
  readonly token: string;
  /** テストでネットワークなしに差し替えるための fetch。 */
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
}

interface RepoResponse {
  id: number;
  full_name: string;
  html_url: string;
  created_at?: string | null;
}

function toInfo(data: RepoResponse): GitHubRepositoryInfo {
  return {
    id: data.id,
    fullName: data.full_name,
    htmlUrl: data.html_url,
    createdAt: data.created_at ?? new Date(0).toISOString(),
  };
}

/** Octokit を使った GitHubClient の実装。失敗は必ず GitHubApiError に変換して投げる。 */
export class OctokitGitHubClient implements GitHubClient {
  private readonly octokit: Octokit;

  constructor(options: OctokitClientOptions) {
    this.octokit = new Octokit({
      auth: options.token,
      userAgent: 'forge-yourself-repository-provisioning-service',
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      request: options.fetch === undefined ? {} : { fetch: options.fetch },
    });
  }

  async createRepository(
    spec: RepositorySpec,
    options?: CallOptions,
  ): Promise<GitHubRepositoryInfo> {
    const common = {
      name: spec.name,
      ...(spec.description === null ? {} : { description: spec.description }),
      private: spec.visibility === 'private',
      auto_init: spec.autoInit,
      request: { signal: options?.signal },
    };
    try {
      const res =
        spec.ownerType === 'organization'
          ? await this.octokit.rest.repos.createInOrg({ org: spec.owner, ...common })
          : await this.octokit.rest.repos.createForAuthenticatedUser(common);
      return toInfo(res.data);
    } catch (error) {
      throw classifyGitHubError(error);
    }
  }

  async getRepository(
    owner: string,
    name: string,
    options?: CallOptions,
  ): Promise<GitHubRepositoryInfo | null> {
    try {
      const res = await this.octokit.rest.repos.get({
        owner,
        repo: name,
        request: { signal: options?.signal },
      });
      return toInfo(res.data);
    } catch (error) {
      const classified = classifyGitHubError(error);
      if (classified.kind === 'not_found') return null;
      throw classified;
    }
  }

  async replaceTopics(
    owner: string,
    name: string,
    topics: readonly string[],
    options?: CallOptions,
  ): Promise<void> {
    try {
      await this.octokit.rest.repos.replaceAllTopics({
        owner,
        repo: name,
        names: [...topics],
        request: { signal: options?.signal },
      });
    } catch (error) {
      throw classifyGitHubError(error);
    }
  }

  async getAuthenticatedLogin(options?: CallOptions): Promise<string> {
    try {
      const res = await this.octokit.rest.users.getAuthenticated({
        request: { signal: options?.signal },
      });
      return res.data.login;
    } catch (error) {
      throw classifyGitHubError(error);
    }
  }
}
