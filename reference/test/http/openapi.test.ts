import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '@app/http/openapi.js';
import { createTestEnv } from '../helpers.js';
import type { TestEnv } from '../helpers.js';

let env: TestEnv | undefined;
afterEach(async () => {
  await env?.close();
});

describe('OpenAPI', () => {
  it('GET /openapi.json が仕様書を返す', async () => {
    env = createTestEnv();
    const res = await env.app.inject('/openapi.json');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
  });

  it('仕様書に載っているすべてのパス・メソッドが、実際にルートとして存在する', () => {
    env = createTestEnv();
    const doc = buildOpenApiDocument() as { paths: Record<string, Record<string, unknown>> };
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const method of Object.keys(methods)) {
        const url = path.replace(/\{(\w+)\}/g, ':$1');
        expect(env.app.hasRoute({ method: method.toUpperCase(), url }), `${method} ${path}`).toBe(
          true,
        );
      }
    }
  });

  it('docs/openapi.json が最新(コードを変えたら npm run docs:openapi を実行する)', () => {
    const committed = JSON.parse(
      readFileSync(new URL('../../../docs/openapi.json', import.meta.url), 'utf8'),
    ) as unknown;
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
  });

  it('エラーコードの一覧がカタログと一致する', () => {
    const doc = buildOpenApiDocument() as {
      components: {
        schemas: {
          ErrorBody: { properties: { error: { properties: { code: { enum: string[] } } } } };
        };
      };
    };
    expect(
      doc.components.schemas.ErrorBody.properties.error.properties.code.enum.length,
    ).toBeGreaterThan(10);
  });
});
