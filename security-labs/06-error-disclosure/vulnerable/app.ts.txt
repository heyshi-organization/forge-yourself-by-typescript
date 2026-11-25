// ⚠️ 意図的に脆弱な演習用コード。本番・公開環境で絶対に使わないこと。
import Database from 'better-sqlite3';
import Fastify from 'fastify';

export function buildLabApp(db: Database.Database) {
  const app = Fastify();

  app.get('/requests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const row = db.prepare('SELECT id, status FROM requests WHERE id = ?').get(id);
      if (!row) return reply.status(404).send({ error: 'not found' });
      return row;
    } catch (error) {
      const e = error as Error;
      // 脆弱: 内部のエラーメッセージ・スタックトレースをそのまま利用者に返している。
      //       DBの種類、テーブル名、サーバー内のファイルパス、使っているライブラリが攻撃者に伝わる。
      return reply.status(500).send({ error: e.message, stack: e.stack });
    }
  });

  return app;
}
