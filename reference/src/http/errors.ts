import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error.js';
import type { FieldIssue } from '../errors/app-error.js';
import { ERROR_CATALOG, isErrorCode } from '../errors/catalog.js';
import type { ErrorCode } from '../errors/catalog.js';

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

// @starter-begin ex05
export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  code: ErrorCode,
  extra: {
    requestId?: string | undefined;
    issues?: readonly FieldIssue[] | undefined;
    retryAfterSeconds?: number | undefined;
  } = {},
): FastifyReply {
  const def = ERROR_CATALOG[code];
  if (extra.retryAfterSeconds !== undefined)
    reply.header('retry-after', String(extra.retryAfterSeconds));
  const body: ErrorBody = {
    error: {
      code,
      message: def.message,
      correlationId: request.id,
      ...(extra.requestId === undefined ? {} : { requestId: extra.requestId }),
      ...(extra.issues === undefined ? {} : { details: extra.issues }),
    },
  };
  return reply.status(def.status).send(body);
}

/** ZodErrorを、入力値を含まない FieldIssue の配列にする。 */
export function toFieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

/** スキーマで検証する。失敗したら VALIDATION_ERROR(400) の AppError を投げる。 */
export function parseWith<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError('VALIDATION_ERROR', { issues: toFieldIssues(result.error) });
  return result.data;
}

/** すべての例外を、利用者に返してよい形に変換する(エラーハンドラから呼ぶ)。 */
export function handleError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof AppError) {
    if (error.httpStatus >= 500) request.log.error({ err: error }, 'アプリケーションエラー');
    return sendError(request, reply, error.code, {
      requestId: error.options.requestId,
      issues: error.options.issues,
      retryAfterSeconds: error.options.retryAfterSeconds,
    });
  }
  if (error instanceof ZodError) {
    return sendError(request, reply, 'VALIDATION_ERROR', { issues: toFieldIssues(error) });
  }

  // Fastify自身が出す4xx(JSONの構文エラー、Content-Type違い、ボディ過大など)
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    if (statusCode === 415) return sendError(request, reply, 'UNSUPPORTED_MEDIA_TYPE');
    if (statusCode === 413) return sendError(request, reply, 'PAYLOAD_TOO_LARGE');
    return sendError(request, reply, 'VALIDATION_ERROR', {
      issues: [{ path: '(body)', message: 'リクエストボディを解釈できません' }],
    });
  }

  // 想定外の例外: 詳細はログにだけ出し、利用者には汎用メッセージを返す
  request.log.error({ err: error }, '想定外のエラー');
  return sendError(request, reply, 'INTERNAL_ERROR');
}

/** 保存済みの失敗(FAILED)のコードをHTTPレスポンスにするときに使う。 */
export function coerceErrorCode(code: string): ErrorCode {
  return isErrorCode(code) ? code : 'INTERNAL_ERROR';
}
// @starter-else
//| // TODO(ex05): docs/exercises/05-api-design.md の「エラー形式」に従って実装する
//| export function sendError(
//|   _request: FastifyRequest,
//|   _reply: FastifyReply,
//|   _code: ErrorCode,
//|   _extra: { requestId?: string | undefined; issues?: readonly FieldIssue[] | undefined; retryAfterSeconds?: number | undefined } = {},
//| ): FastifyReply {
//|   throw new NotImplementedError('05');
//| }
//|
//| export function toFieldIssues(_error: ZodError): FieldIssue[] {
//|   throw new NotImplementedError('05');
//| }
//|
//| export function parseWith<T>(_schema: ZodType<T>, _value: unknown): T {
//|   throw new NotImplementedError('05');
//| }
//|
//| export function handleError(_error: unknown, _request: FastifyRequest, _reply: FastifyReply): FastifyReply {
//|   throw new NotImplementedError('05');
//| }
//|
//| export function coerceErrorCode(_code: string): ErrorCode {
//|   throw new NotImplementedError('05');
//| }
// @starter-end
