export const GITHUB_ERROR_KINDS = [
  'auth', // 401: トークンが無効
  'permission', // 403: 権限不足
  'rate_limit', // 403/429: レート制限
  'conflict', // 422: 同名リポジトリが存在
  'rejected', // 422: その他、GitHubが内容を拒否
  'not_found', // 404
  'unavailable', // 5xx: GitHub側の一時障害
  'network', // 接続エラー等
  'timeout', // こちらのタイムアウト
  'unknown',
] as const;
export type GitHubErrorKind = (typeof GITHUB_ERROR_KINDS)[number];

/** GitHub APIの失敗を、アプリが扱いやすい形に分類したエラー。 */
export class GitHubApiError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    readonly options: {
      status?: number;
      /** レート制限時、再試行までに待つべきミリ秒。 */
      retryAfterMs?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'GitHubApiError';
  }

  get status(): number | undefined {
    return this.options.status;
  }

  get retryAfterMs(): number | undefined {
    return this.options.retryAfterMs;
  }

  /**
   * 「結果が分からない」失敗か。
   * タイムアウトや5xxの場合、リクエストはGitHubに届いていて、リポジトリが作成済みかもしれない。
   * この種のエラーの後に再試行して conflict が返っても、すぐに「他人が作った」とは断定できない。
   */
  get ambiguous(): boolean {
    return (
      this.kind === 'timeout' ||
      this.kind === 'network' ||
      this.kind === 'unavailable' ||
      this.kind === 'unknown'
    );
  }
}
