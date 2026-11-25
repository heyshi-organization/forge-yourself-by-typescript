import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildLabApp } from './app.js';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE requests (id INTEGER PRIMARY KEY, status TEXT, owner TEXT);
    INSERT INTO requests VALUES (1, 'PENDING', 'alice'), (2, 'SUCCEEDED', 'bob'), (3, 'FAILED', 'carol');
    CREATE TABLE api_secrets (id INTEGER PRIMARY KEY, value TEXT);
    INSERT INTO api_secrets VALUES (1, 'top-secret-value');
  `);
});

const get = async (status: string) => {
  const app = buildLabApp(db);
  const res = await app.inject({ method: 'GET', url: '/requests', query: { status } });
  await app.close();
  return res;
};

describe('正常な利用', () => {
  it('status で絞り込める', async () => {
    const res = await get('PENDING');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ items: { owner: string }[] }>().items.map((r) => r.owner)).toEqual(['alice']);
  });
});

describe('SQLインジェクション(攻撃は防がれなければならない)', () => {
  it("OR 1=1 で全件を取得できてはいけない", async () => {
    const res = await get("PENDING' OR '1'='1");
    const items = res.statusCode === 200 ? res.json<{ items: unknown[] }>().items : [];
    expect(items).toHaveLength(0);
  });

  it('UNION で別テーブルの秘密を読み出せてはいけない', async () => {
    const res = await get("x' UNION SELECT id, value, 'leak' FROM api_secrets --");
    expect(res.body).not.toContain('top-secret-value');
  });

  it('SQLを壊す入力でも、内部のSQLエラーを返さない', async () => {
    const res = await get("'");
    expect(res.body).not.toMatch(/SQLITE|syntax error|unrecognized token/i);
  });
});
