// ⚠️ 意図的に脆弱な演習用コード。本番・公開環境で絶対に使わないこと。
import Fastify from 'fastify';

/** 利用者が指定したURLの画像(アバター)を取得して、内容の大きさを返すAPI */
export function buildLabApp() {
  const app = Fastify();

  app.get('/avatar', async (req) => {
    const { url } = req.query as { url: string };
    // 脆弱: 利用者が指定したURLに、サーバーがそのままリクエストを送っている(SSRF)。
    //       http://127.0.0.1/... や クラウドのメタデータURL(http://169.254.169.254/...)など、
    //       外部からは届かない「サーバーの内側」のURLを読み出せてしまう。
    const res = await fetch(url);
    const body = await res.text();
    return { status: res.status, bytes: body.length };
  });

  return app;
}
