// ⚠️ 意図的に脆弱な演習用コード。本番・公開環境で絶対に使わないこと。
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import Fastify from 'fastify';

const execAsync = promisify(exec);

export function buildLabApp() {
  const app = Fastify();

  // リポジトリ名を受け取り、「処理対象です」と表示するだけの外部コマンド呼び出し
  app.get('/repo-info', async (req) => {
    const { name } = req.query as { name: string };
    // 脆弱: ユーザー入力をシェルのコマンド文字列に連結している(シェルが ; や && を解釈する)
    const { stdout } = await execAsync('echo repository: ' + name);
    return { output: stdout };
  });

  return app;
}
