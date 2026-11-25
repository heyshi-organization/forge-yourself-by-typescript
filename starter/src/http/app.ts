import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createRepositoryBodySchema,
  idempotencyKeySchema,
  listQuerySchema,
  requestIdParamSchema,
  toRepositorySpec,
} from '../schemas/repository.js';
import type { AppLogger } from '../logging/logger.js';
import type { ProvisioningService } from '../services/provisioning-service.js';
import { buildOpenApiDocument } from './openapi.js';
import { coerceErrorCode, handleError, parseWith, sendError } from './errors.js';
import { AppError } from '../errors/app-error.js';
import { toRequestResource } from './resource.js';
import { NotImplementedError } from '../shared/not-implemented.js';

export interface AppDeps {
  readonly service: ProvisioningService;
  readonly logger: AppLogger;
}

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/** 受け取った X-Correlation-Id が安全な形式ならそれを使い、そうでなければ新しく発行する(ログ汚染対策)。 */
function resolveCorrelationId(request: { headers: Record<string, unknown> }): string {
  const incoming = request.headers['x-correlation-id'];
  return typeof incoming === 'string' && CORRELATION_ID_PATTERN.test(incoming)
    ? incoming
    : randomUUID();
}

function parseIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  if (raw === undefined) throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
  const parsed = idempotencyKeySchema.safeParse(raw);
  if (!parsed.success) throw new AppError('IDEMPOTENCY_KEY_INVALID');
  return parsed.data;
}

// TODO(ex05): Fastifyアプリを組み立てる(docs/exercises/05-api-design.md)
// 必要なルート: GET /healthz, GET /openapi.json, POST/GET /v1/repository-requests, GET /v1/repository-requests/:id
export function buildApp(_deps: AppDeps): FastifyInstance {
  throw new NotImplementedError('05');
}
