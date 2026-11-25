// ⚠️ 意図的に脆弱な演習用コード。本番・公開環境で絶対に使わないこと。
import Fastify from 'fastify';

interface CreateRequestBody {
  name: string;
  visibility: 'public' | 'private';
}
interface StoredRequest extends CreateRequestBody {
  id: number;
  status: 'PENDING' | 'SUCCEEDED';
  owner: string;
}

export function buildLabApp() {
  const app = Fastify();
  const store: StoredRequest[] = [];

  app.post('/requests', async (req, reply) => {
    // 脆弱1: `as` は型の「主張」であって検証ではない。実行時には何でも入ってくる
    const body = req.body as CreateRequestBody;
    // 脆弱2: 受け取ったオブジェクトをそのまま展開している(Mass Assignment)。
    //        クライアントが status や owner を勝手に指定できてしまう
    const record = { id: store.length + 1, status: 'PENDING', owner: 'anonymous', ...body } as StoredRequest;
    store.push(record);
    return reply.status(201).send(record);
  });

  app.get('/requests', async (req) => {
    // 脆弱3: クエリを検証せずに数値化している(NaN・負数・巨大値がそのまま通る)
    const limit = Number((req.query as { limit?: string }).limit ?? 10);
    return { items: store.slice(0, limit) };
  });

  return app;
}
