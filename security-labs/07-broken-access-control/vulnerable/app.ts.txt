// ⚠️ 意図的に脆弱な演習用コード。本番・公開環境で絶対に使わないこと。
import Fastify from 'fastify';

interface Item {
  id: number;
  owner: string;
  name: string;
}

/** 学習用の簡易認証: x-user ヘッダがユーザー名(実際のシステムでは署名付きトークン等を使う) */
export function buildLabApp() {
  const app = Fastify();
  const items: Item[] = [];

  app.post('/items', async (req, reply) => {
    const user = req.headers['x-user'] as string;
    const { name } = req.body as { name: string };
    const item = { id: items.length + 1, owner: user, name };
    items.push(item);
    return reply.status(201).send(item);
  });

  app.get('/items/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = items.find((i) => i.id === Number(id));
    // 脆弱1: 持ち主かどうかを確認していない(IDORと呼ばれる。IDを変えるだけで他人のデータが見える)
    return item ?? reply.status(404).send({ error: 'not found' });
  });

  app.delete('/items/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const index = items.findIndex((i) => i.id === Number(id));
    if (index < 0) return reply.status(404).send({ error: 'not found' });
    // 脆弱2: 認可チェックなしで削除できる
    items.splice(index, 1);
    return reply.status(204).send();
  });

  app.get('/admin/stats', async (req, reply) => {
    // 脆弱3: 管理者かどうかをクライアントが送るヘッダで判断している(なりすまし可能)
    if (req.headers['x-role'] !== 'admin') return reply.status(403).send({ error: 'forbidden' });
    return { count: items.length };
  });

  return app;
}
