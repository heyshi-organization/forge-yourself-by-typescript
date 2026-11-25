import { writeFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../reference/src/http/openapi.js';

writeFileSync(
  new URL('../docs/openapi.json', import.meta.url),
  `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`,
);
process.stdout.write('docs/openapi.json を更新しました\n');
