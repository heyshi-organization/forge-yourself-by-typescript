/**
 * アプリが利用者に返すエラーの一覧(エラーカタログ)。
 * - status: HTTPステータス
 * - message: 利用者に見せてよい文面(内部情報・秘密情報は含めない)
 * 内部の詳細(スタックトレース、GitHubのレスポンス等)は、ここではなくログにだけ出す。
 */
export const ERROR_CATALOG = {
  VALIDATION_ERROR: { status: 400, message: '入力値が不正です。' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, message: 'Idempotency-Key ヘッダが必要です。' },
  IDEMPOTENCY_KEY_INVALID: { status: 400, message: 'Idempotency-Key の形式が不正です。' },
  NOT_FOUND: { status: 404, message: '指定されたリソースが見つかりません。' },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: 'Content-Type は application/json にしてください。',
  },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'リクエストが大きすぎます。' },
  IDEMPOTENCY_KEY_REUSED: {
    status: 422,
    message: '同じ Idempotency-Key で異なる内容のリクエストが送信されました。',
  },
  OWNER_MISMATCH: {
    status: 422,
    message: 'ownerType が user の場合、owner はサービスの認証ユーザーと一致する必要があります。',
  },
  REQUEST_IN_PROGRESS: {
    status: 409,
    message: '同じリクエストを処理中です。しばらくしてから状態を確認してください。',
  },
  REPOSITORY_REQUEST_IN_PROGRESS: {
    status: 409,
    message: '同じリポジトリの作成要求を処理中です。',
  },
  REPOSITORY_ALREADY_EXISTS: { status: 409, message: '同名のリポジトリがすでに存在します。' },
  GITHUB_AUTH_FAILED: {
    status: 502,
    message: 'GitHubへの認証に失敗しました。サービス管理者に連絡してください。',
  },
  GITHUB_PERMISSION_DENIED: {
    status: 502,
    message: 'GitHubで必要な権限がありません。サービス管理者に連絡してください。',
  },
  GITHUB_RATE_LIMITED: {
    status: 503,
    message:
      'GitHubのレート制限に達しました。しばらくしてから別の Idempotency-Key で再試行してください。',
  },
  GITHUB_UNAVAILABLE: {
    status: 503,
    message:
      'GitHubが一時的に利用できません。しばらくしてから別の Idempotency-Key で再試行してください。',
  },
  GITHUB_TIMEOUT: {
    status: 504,
    message:
      'GitHubからの応答がタイムアウトしました。しばらくしてから別の Idempotency-Key で再試行してください。',
  },
  GITHUB_REJECTED: { status: 422, message: 'GitHubが指定内容を受け付けませんでした。' },
  INTERRUPTED: {
    status: 500,
    message: '処理が中断され、GitHub上にリポジトリが作成されていることを確認できませんでした。',
  },
  INTERNAL_ERROR: { status: 500, message: '内部エラーが発生しました。' },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_CATALOG, value);
}
