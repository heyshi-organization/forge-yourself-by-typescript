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

// @starter-begin ex05
export function buildApp(deps: AppDeps): FastifyInstance {
  const { service } = deps;
  const app = Fastify({
    loggerInstance: deps.logger,
    genReqId: resolveCorrelationId,
    logController: new LogController({ requestIdLogLabel: 'correlationId' }),
    bodyLimit: 16 * 1024,
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-correlation-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('cache-control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => handleError(error, request, reply));
  app.setNotFoundHandler((request, reply) => sendError(request, reply, 'NOT_FOUND'));

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/openapi.json', async () => buildOpenApiDocument());

  app.post('/v1/repository-requests', async (request, reply) => {
    const idempotencyKey = parseIdempotencyKey(request);
    const body = parseWith(createRepositoryBodySchema, request.body);
    const { request: result, replayed } = await service.submit({
      spec: toRepositorySpec(body),
      idempotencyKey,
    });

    if (replayed) reply.header('idempotent-replayed', 'true');
    if (result.status === 'FAILED') {
      return sendError(request, reply, coerceErrorCode(result.error.code), {
        requestId: result.id,
      });
    }
    reply.header('location', `/v1/repository-requests/${result.id}`);
    return reply.status(replayed ? 200 : 201).send(toRequestResource(result));
  });

  app.get('/v1/repository-requests', async (request) => {
    const query = parseWith(listQuerySchema, request.query);
    const page = await service.list(query);
    return {
      items: page.items.map(toRequestResource),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  });

  app.get('/v1/repository-requests/:id', async (request) => {
    const { id } = parseWith(requestIdParamSchema, request.params);
    return toRequestResource(await service.get(id));
  });

  return app;
}
// @starter-else
//| // TODO(ex05): Fastifyアプリを組み立てる(docs/exercises/05-api-design.md)
//| // 必要なルート: GET /healthz, GET /openapi.json, POST/GET /v1/repository-requests, GET /v1/repository-requests/:id
//| export function buildApp(_deps: AppDeps): FastifyInstance {
//|   throw new NotImplementedError('05');
//| }
// @starter-end
