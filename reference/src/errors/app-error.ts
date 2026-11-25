import { ERROR_CATALOG } from './catalog.js';
import type { ErrorCode } from './catalog.js';

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * アプリケーションが「想定している」エラー。コードは ERROR_CATALOG のキー。
 * 想定外の例外(TypeError等)は AppError ではなく、HTTP層で INTERNAL_ERROR に変換する。
 */
export class AppError extends Error {
  readonly httpStatus: number;
  readonly publicMessage: string;

  constructor(
    readonly code: ErrorCode,
    readonly options: {
      cause?: unknown;
      issues?: readonly FieldIssue[];
      /** 内部ログ用の補足。利用者には返らない。 */
      internalDetail?: string;
      retryAfterSeconds?: number;
      /** 紐づく作成要求のID。 */
      requestId?: string;
    } = {},
  ) {
    const def = ERROR_CATALOG[code];
    super(
      options.internalDetail ?? def.message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'AppError';
    this.httpStatus = def.status;
    this.publicMessage = def.message;
  }
}
