import type { GitHubRepositoryInfo, RepositorySpec } from '../domain/request.js';

export interface CallOptions {
  readonly signal?: AbortSignal;
}

/**
 * GitHub APIとの境界(ポート)。ビジネスロジックはこのインターフェースだけに依存する。
 * 実装: OctokitGitHubClient(本物) / FakeGitHubClient(テスト・ローカル動作確認)
 * 失敗時は GitHubApiError を投げる。
 */
export interface GitHubClient {
  /** リポジトリを作成する。名前が重複していれば kind='conflict' のエラー。 */
  createRepository(spec: RepositorySpec, options?: CallOptions): Promise<GitHubRepositoryInfo>;
  /** 存在しなければ null。 */
  getRepository(
    owner: string,
    name: string,
    options?: CallOptions,
  ): Promise<GitHubRepositoryInfo | null>;
  /** topics を丸ごと置き換える(何度実行しても結果が同じ=冪等)。 */
  replaceTopics(
    owner: string,
    name: string,
    topics: readonly string[],
    options?: CallOptions,
  ): Promise<void>;
  /** 認証ユーザーのログイン名。ownerType='user' のownerチェックに使う。 */
  getAuthenticatedLogin(options?: CallOptions): Promise<string>;
}
