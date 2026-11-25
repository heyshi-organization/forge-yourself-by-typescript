import { z } from 'zod';
import { ERROR_CATALOG } from '../errors/catalog.js';
import { createRepositoryBodySchema } from '../schemas/repository.js';
import { REQUEST_STATUSES } from '../domain/request.js';

type Json = Record<string, unknown>;

/** Zodスキーマ → JSON Schema。入力検証と仕様書が同じ定義から作られるので、ずれにくい。 */
function schemaOf(schema: z.ZodType): Json {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-2020-12',
  }) as Json;
  return rest;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json): Json => ({ 'application/json': { schema } });
const errorResponse = (description: string): Json => ({
  description,
  content: json(ref('ErrorBody')),
});

const idempotencyKeyHeader = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description: '8〜128文字の英数字・ - _ 。同じキーでの再送は、前回の結果を返す(再実行しない)。',
  schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,128}$' },
};

/** OpenAPI 3.1 のドキュメントを生成する。GET /openapi.json と docs/openapi.json の元。 */
export function buildOpenApiDocument(): Json {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Repository Provisioning Service',
      version: '1.0.0',
      description: 'GitHubリポジトリの作成要求を受け付け、結果を保存・参照するローカル用API。',
    },
    servers: [{ url: 'http://127.0.0.1:3000' }],
    paths: {
      '/healthz': {
        get: {
          summary: 'ヘルスチェック',
          responses: {
            '200': {
              description: 'OK',
              content: json({
                type: 'object',
                properties: { status: { const: 'ok' } },
                required: ['status'],
              }),
            },
          },
        },
      },
      '/v1/repository-requests': {
        post: {
          summary: 'リポジトリ作成要求を送る(冪等)',
          parameters: [idempotencyKeyHeader],
          requestBody: { required: true, content: json(ref('CreateRepositoryBody')) },
          responses: {
            '201': { description: '作成した', content: json(ref('RequestResource')) },
            '200': {
              description: '同じ Idempotency-Key の過去の結果(Idempotent-Replayed: true)',
              content: json(ref('RequestResource')),
            },
            '400': errorResponse('入力値が不正 / Idempotency-Key が無い・不正'),
            '409': errorResponse('同名リポジトリが存在 / 同じ要求を処理中'),
            '413': errorResponse('リクエストが大きすぎる'),
            '415': errorResponse('Content-Type が application/json ではない'),
            '422': errorResponse('同じキーで内容が違う / GitHubが内容を拒否 / owner不一致'),
            '500': errorResponse('内部エラー'),
            '502': errorResponse('GitHubの認証・権限の問題(サービス管理者の対応が必要)'),
            '503': errorResponse('GitHubのレート制限・一時障害'),
            '504': errorResponse('GitHubがタイムアウト'),
          },
        },
        get: {
          summary: '作成要求の一覧',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
            { name: 'status', in: 'query', schema: { enum: [...REQUEST_STATUSES] } },
          ],
          responses: {
            '200': { description: 'OK', content: json(ref('RequestList')) },
            '400': errorResponse('クエリが不正'),
          },
        },
      },
      '/v1/repository-requests/{id}': {
        get: {
          summary: '作成要求の詳細(処理状態・作成結果)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'OK', content: json(ref('RequestResource')) },
            '404': errorResponse('存在しない'),
          },
        },
      },
    },
    components: {
      schemas: {
        CreateRepositoryBody: schemaOf(createRepositoryBodySchema),
        RequestResource: {
          type: 'object',
          required: [
            'id',
            'status',
            'spec',
            'repository',
            'warnings',
            'error',
            'createdAt',
            'updatedAt',
            'startedAt',
            'finishedAt',
          ],
          properties: {
            id: { type: 'string' },
            status: { enum: [...REQUEST_STATUSES] },
            spec: schemaOf(createRepositoryBodySchema),
            repository: {
              oneOf: [
                { type: 'null' },
                {
                  type: 'object',
                  required: ['id', 'fullName', 'htmlUrl'],
                  properties: {
                    id: { type: 'integer' },
                    fullName: { type: 'string' },
                    htmlUrl: { type: 'string', format: 'uri' },
                  },
                },
              ],
            },
            warnings: { type: 'array', items: { type: 'string' } },
            error: {
              oneOf: [
                { type: 'null' },
                {
                  type: 'object',
                  required: ['code', 'message'],
                  properties: { code: { type: 'string' }, message: { type: 'string' } },
                },
              ],
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            startedAt: { type: ['string', 'null'], format: 'date-time' },
            finishedAt: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        RequestList: {
          type: 'object',
          required: ['items', 'total', 'limit', 'offset'],
          properties: {
            items: { type: 'array', items: ref('RequestResource') },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
        ErrorBody: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'correlationId'],
              properties: {
                code: { enum: Object.keys(ERROR_CATALOG) },
                message: { type: 'string' },
                correlationId: { type: 'string' },
                requestId: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['path', 'message'],
                    properties: { path: { type: 'string' }, message: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
