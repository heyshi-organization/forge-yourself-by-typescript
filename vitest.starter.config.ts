import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 学習者が starter/test に書いた自分のテストを実行する設定。
export default defineConfig({
  resolve: { alias: { '@app': fileURLToPath(new URL('./starter/src', import.meta.url)) } },
  test: { include: ['starter/test/**/*.test.ts'], environment: 'node', passWithNoTests: true },
});
