// ⚠️ 意図的に脆弱な演習用コード。本番・公開環境で絶対に使わないこと。
import Database from 'better-sqlite3';
import Fastify from 'fastify';

export function buildLabApp(db: Database.Database) {
  const app = Fastify();

  app.get('/requests', async (req) => {
    const { status } = req.query as { status: string };
    // 脆弱: ユーザー入力(status)をSQL文字列に直接連結している
    const rows = db
      .prepare("SELECT id, status, owner FROM requests WHERE status = '" + status + "'")
      .all();
    return { items: rows };
  });

  return app;
}
