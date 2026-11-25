import type { FastifyBaseLogger } from 'fastify';
import { pino } from 'pino';
import type { DestinationStream } from 'pino';
import { redactSecrets, redactString } from './redact.js';

/** アプリ全体で使うロガーの型。Fastifyが要求する最小のインターフェースに合わせている。 */
export type AppLogger = FastifyBaseLogger;

/** キー名で伏せるパス(pinoのredact。シリアライズ後のオブジェクトに適用される)。 */
const REDACT_PATHS = [
  'token',
  'githubToken',
  'password',
  'secret',
  'authorization',
  'apiKey',
  '*.token',
  '*.githubToken',
  '*.password',
  '*.secret',
  '*.authorization',
  '*.apiKey',
  'req.headers.authorization',
  'req.headers.cookie',
];

/**
 * 構造化ログ(JSON Lines)を出すロガー。秘密情報は二重に防ぐ。
 *  1. キー名による伏せ(pino redact)
 *  2. 出力する1行ごとに、トークン形式の文字列を伏せる(最後の防衛線)
 *
 * 注意: pino の formatters.log は serializers より「前」に動くため、
 * Fastify の req/res のようなオブジェクトを壊さないよう、ここでは出力側で処理する。
 */
export function createLogger(level: string, destination?: DestinationStream): AppLogger {
  const sink = destination ?? pino.destination({ dest: 1, sync: true });
  const redactingSink: DestinationStream = {
    write: (line: string) => sink.write(redactString(line)),
  };
  return pino(
    {
      level,
      base: { service: 'repository-provisioning-service' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      serializers: {
        err: (error: unknown) => redactSecrets(pino.stdSerializers.err(error as Error)),
      },
    },
    redactingSink,
  );
}
