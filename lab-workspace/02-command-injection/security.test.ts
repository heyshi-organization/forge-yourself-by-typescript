import { describe, expect, it } from 'vitest';
import { buildLabApp } from './app.js';

const get = async (name: string) => {
  const app = buildLabApp();
  const res = await app.inject({ method: 'GET', url: '/repo-info', query: { name } });
  await app.close();
  return res;
};
const lines = (res: { body: string }) => {
  try {
    return (JSON.parse(res.body) as { output?: string }).output?.split('\n') ?? [];
  } catch {
    return [];
  }
};

describe('正常な利用', () => {
  it('リポジトリ名を表示できる', async () => {
    const res = await get('demo-repo');
    expect(res.statusCode).toBe(200);
    expect(lines(res)).toContain('repository: demo-repo');
  });
});

describe('コマンドインジェクション(攻撃は防がれなければならない)', () => {
  it.each([
    ['セミコロン', 'demo; echo INJECTED'],
    ['&&', 'demo && echo INJECTED'],
    ['パイプ', 'demo | echo INJECTED'],
    ['コマンド置換 $()', 'demo $(echo INJECTED)'],
    ['バッククォート', 'demo `echo INJECTED`'],
    ['改行', 'demo\necho INJECTED'],
  ])('%s: 別のコマンドが実行されてはいけない', async (_label, payload) => {
    const res = await get(payload);
    // 注入されたコマンドの出力 "INJECTED" が、単独の行として現れたら実行されている
    expect(lines(res)).not.toContain('INJECTED');
  });
});
