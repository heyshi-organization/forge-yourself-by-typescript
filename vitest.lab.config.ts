import { defineConfig } from 'vitest/config';

/**
 * セキュリティ演習(security-labs)のテスト設定。scripts/lab.mjs が使う。
 *   TEST_FILES: 実行するテストファイル(カンマ区切り)
 */
const files = (process.env.TEST_FILES ?? 'lab-workspace/**/*.test.ts').split(',');

export default defineConfig({ test: { include: files, environment: 'node' } });
