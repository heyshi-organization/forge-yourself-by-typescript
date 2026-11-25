import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error.js';
import type { FieldIssue } from '../errors/app-error.js';
import { ERROR_CATALOG, isErrorCode } from '../errors/catalog.js';
import type { ErrorCode } from '../errors/catalog.js';
import { NotImplementedError } from '../shared/not-implemented.js';

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** HTTPリクエストの相関ID(X-Correlation-Id と同じ値)。問い合わせ時にログと突き合わせる。 */
    correlationId: string;
    /** 紐づく作成要求のID(あれば)。 */
    requestId?: string;
    /** 入力エラーの詳細(どの項目が、なぜ不正か)。入力値そのものは含めない。 */
    details?: readonly FieldIssue[];
  };
}

// TODO(ex05): docs/exercises/05-api-design.md の「エラー形式」に従って実装する
export function sendError(
  _request: FastifyRequest,
  _reply: FastifyReply,
  _code: ErrorCode,
  _extra: {
    requestId?: string | undefined;
    issues?: readonly FieldIssue[] | undefined;
    retryAfterSeconds?: number | undefined;
  } = {},
): FastifyReply {
  throw new NotImplementedError('05');
}

export function toFieldIssues(_error: ZodError): FieldIssue[] {
  throw new NotImplementedError('05');
}

export function parseWith<T>(_schema: ZodType<T>, _value: unknown): T {
  throw new NotImplementedError('05');
}

export function handleError(
  _error: unknown,
  _request: FastifyRequest,
  _reply: FastifyReply,
): FastifyReply {
  throw new NotImplementedError('05');
}

export function coerceErrorCode(_code: string): ErrorCode {
  throw new NotImplementedError('05');
}
