import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 課題の受け入れテスト(exercises/tests)を実行する設定。
 * TARGET=starter(既定): 学習者の実装(starter/src)を検証する
 * TARGET=reference    : 完成形(reference/src)で受け入れテスト自体が正しいことを検証する(CI)
 */
const target = process.env.TARGET === 'reference' ? 'reference' : 'starter';

export default defineConfig({
  resolve: { alias: { '@app': fileURLToPath(new URL(`./${target}/src`, import.meta.url)) } },
  test: {
    include: ['exercises/tests/**/*.test.ts'],
    environment: 'node',
    typecheck: {
      enabled: true,
      include: ['exercises/tests/**/*.test-d.ts'],
      tsconfig: target === 'reference' ? './tsconfig.json' : './tsconfig.starter.json',
    },
  },
});
