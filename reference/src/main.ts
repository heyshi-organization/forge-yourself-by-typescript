import { existsSync } from 'node:fs';
import { buildContainer } from './composition.js';
import { ConfigError, parseConfig } from './schemas/config.js';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');

  let config;
  try {
    config = parseConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const container = buildContainer(config);
  const log = container.app.log;

  // 前回の実行で中断された要求があれば、受付開始前に後始末する
  const report = await container.service.recoverStale();
  if (report.checked > 0) log.warn({ report }, '中断されていた要求を復旧しました');

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      log.info({ signal }, '終了します');
      container.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }

  await container.app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `起動に失敗しました: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
