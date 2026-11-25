// ⚠️ 意図的に脆弱な演習用コード。本番・公開環境で絶対に使わないこと。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';

/** baseDir/templates/ 配下のテンプレートファイルを返すAPI */
export function buildLabApp(baseDir: string) {
  const app = Fastify();

  app.get('/templates', async (req, reply) => {
    const { name } = req.query as { name: string };
    try {
      // 脆弱: ユーザー入力をそのままパスに連結している("../" で templates の外に出られる)
      const content = readFileSync(join(baseDir, 'templates', name), 'utf8');
      return { content };
    } catch {
      return reply.status(404).send({ error: 'not found' });
    }
  });

  return app;
}
