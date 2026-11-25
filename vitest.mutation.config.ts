import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * ミューテーション検査用の設定(scripts/check-mutants.mjs が使う)。
 *   MUTANT      : retry.ts の代わりに読み込む「バグ入り」実装のパス(未指定なら完成形)
 *   TEST_FILES  : 検査するテストファイル(カンマ区切り)
 */
const mutant = process.env.MUTANT;
const files = (process.env.TEST_FILES ?? 'starter/test/ex07-retry.test.ts').split(',');

export default defineConfig({
  resolve: {
    alias: [
      ...(mutant ? [{ find: /^@app\/async\/retry\.js$/, replacement: resolve(mutant) }] : []),
      { find: '@app', replacement: fileURLToPath(new URL('./reference/src', import.meta.url)) },
      { find: '@test', replacement: fileURLToPath(new URL('./test-support', import.meta.url)) },
    ],
  },
  test: { include: files, environment: 'node' },
});
