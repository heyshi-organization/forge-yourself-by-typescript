import { defineConfig } from 'vitest/config';

// 実GitHub APIを使うテスト。通常のテスト(npm test)には含まれない。
// 実行方法と安全条件は docs/testing-strategy.md を参照。
export default defineConfig({
  test: { include: ['reference/test-live/**/*.live.test.ts'], environment: 'node', testTimeout: 60_000 },
});
