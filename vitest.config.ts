import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 完成形(reference)のテスト。ネットワーク接続・認証情報なしで実行できる。
export default defineConfig({
  resolve: { alias: { '@app': fileURLToPath(new URL('./reference/src', import.meta.url)) } },
  test: {
    include: ['reference/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['reference/src/**/*.ts'],
      exclude: ['reference/src/main.ts', 'reference/src/shared/not-implemented.ts'],
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
