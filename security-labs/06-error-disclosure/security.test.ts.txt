import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildLabApp } from './app.js';

const setup = () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE requests (id INTEGER PRIMARY KEY, status TEXT); INSERT INTO requests VALUES (1, 'PENDING');");
  return db;
};

describe('正常な利用', () => {
  it('取得できる / 無ければ404', async () => {
    const app = buildLabApp(setup());
    expect((await app.inject('/requests/1')).json()).toMatchObject({ id: 1, status: 'PENDING' });
    expect((await app.inject('/requests/99')).statusCode).toBe(404);
    await app.close();
  });
});

describe('エラー情報の過剰な公開(内部情報を返してはいけない)', () => {
  it('DB障害のとき、利用者へのレスポンスに内部情報が含まれない', async () => {
    const db = setup();
    db.exec('DROP TABLE requests'); // 障害を再現
    const app = buildLabApp(db);
    const res = await app.inject('/requests/1');
    await app.close();

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatch(/SQLITE|no such table|requests/i); // DBの種類・テーブル名
    expect(res.body).not.toMatch(/stack|\bat \w|node_modules|\.ts:\d+|\/Users\/|\/home\//); // スタックトレース・パス
  });

  it('問い合わせ用のIDは返してよい(原因調査のため)', async () => {
    const db = setup();
    db.exec('DROP TABLE requests');
    const logged: object[] = [];
    const app = buildLabApp(db, (entry) => logged.push(entry));
    const res = await app.inject('/requests/1');
    await app.close();
    expect(res.json<{ errorId?: string }>().errorId).toBeTypeOf('string');
    expect(logged).toHaveLength(1); // 詳細は内部ログに残る
  });
});
