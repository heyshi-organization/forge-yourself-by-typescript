// ⚠️ 意図的に脆弱な演習用コード。本番・公開環境で絶対に使わないこと。
// 注意: 下の値は演習用のダミーです。実際のトークンやパスワードをここに書いてはいけません。
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';

// 脆弱: 秘密の鍵がソースコードに直接書かれている。
//       リポジトリが公開されれば誰でも読めるし、Git履歴に残り続ける(後から消しても遅い)。
const SIGNING_KEY = 'lab-dummy-signing-key-0123456789';
const ADMIN_PASSWORD = 'lab-dummy-admin-password';

export function buildLabApp(_env: Record<string, string | undefined> = {}) {
  const app = Fastify();

  app.get('/token', async (req) => {
    const { user } = req.query as { user: string };
    const signature = createHmac('sha256', SIGNING_KEY).update(user).digest('hex');
    return { token: `${user}.${signature}` };
  });

  app.get('/admin', async (req, reply) => {
    const { password } = req.query as { password?: string };
    if (password !== ADMIN_PASSWORD) return reply.status(401).send({ error: 'unauthorized' });
    return { ok: true };
  });

  return app;
}
