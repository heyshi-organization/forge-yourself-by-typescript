import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@app/db/database.js';
import { MIGRATIONS, migrate } from '@app/db/migrations.js';
import { PersistenceError } from '@app/db/request-repository.js';
import { SqliteRequestRepository } from '@app/db/sqlite-request-repository.js';
import { makeSpec } from '../helpers.js';

let db: Database.Database;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => {
  if (db.open) db.close();
});

const insertRaw = (overrides: Record<string, unknown> = {}) => {
  const row = {
    id: 'a',
    idempotency_key: 'key-aaaaaaaa',
    request_hash: 'h',
    status: 'PENDING',
    owner: 'acme',
    owner_type: 'user',
    repo_name: 'r',
    description: null,
    visibility: 'public',
    auto_init: 0,
    topics_json: '[]',
    created_at: 't',
    updated_at: 't',
    ...overrides,
  };
  const cols = Object.keys(row);
  db.prepare(
    `INSERT INTO provisioning_requests (${cols.join(',')}) VALUES (${cols.map((c) => `@${c}`).join(',')})`,
  ).run(row);
};

describe('migrations', () => {
  it('適用済みの履歴が残り、再実行しても何も起きない(冪等)', () => {
    expect(db.prepare('SELECT id, name FROM schema_migrations').all()).toEqual([
      { id: 1, name: 'create_provisioning_requests' },
    ]);
    expect(migrate(db)).toEqual([]);
  });

  it('未適用のものだけを番号順に適用する', () => {
    const next = { id: 2, name: 'add_dummy', sql: 'CREATE TABLE dummy (x INTEGER) STRICT;' };
    expect(migrate(db, [...MIGRATIONS, next])).toEqual([2]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM dummy').get()).toEqual({ n: 0 });
  });

  it('失敗したマイグレーションはロールバックされ、履歴にも残らない', () => {
    const bad = {
      id: 2,
      name: 'bad',
      sql: 'CREATE TABLE ok_table (x INTEGER) STRICT; CREATE TABLE ok_table (y INTEGER) STRICT;',
    };
    expect(() => migrate(db, [...MIGRATIONS, bad])).toThrow();
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok_table'").get(),
    ).toBeUndefined();
    expect(db.prepare('SELECT id FROM schema_migrations WHERE id = 2').get()).toBeUndefined();
  });
});

describe('DB制約(アプリのバグがあっても不正なデータを入れさせない)', () => {
  it('idempotency_key は一意', () => {
    insertRaw();
    expect(() => insertRaw({ id: 'b', repo_name: 'other' })).toThrow(/UNIQUE/);
  });
  it('status は定義された値のみ', () => {
    expect(() => insertRaw({ status: 'DONE' })).toThrow(/CHECK/);
  });
  it('SUCCEEDED なのに GitHub の情報が無い行は入れられない', () => {
    expect(() => insertRaw({ status: 'SUCCEEDED', started_at: 't', finished_at: 't' })).toThrow(
      /CHECK/,
    );
  });
  it('FAILED なのに error_code が無い行は入れられない', () => {
    expect(() => insertRaw({ status: 'FAILED', started_at: 't', finished_at: 't' })).toThrow(
      /CHECK/,
    );
  });
  it('topics_json は正しいJSONのみ', () => {
    expect(() => insertRaw({ topics_json: '{not json' })).toThrow(/CHECK/);
  });
  it('STRICT テーブル: 型の違う値は拒否される', () => {
    expect(() => insertRaw({ auto_init: 'yes' })).toThrow();
  });
  it('処理中の同一リポジトリは大文字小文字を区別せず1件まで', () => {
    insertRaw();
    expect(() =>
      insertRaw({ id: 'b', idempotency_key: 'key-bbbbbbbb', owner: 'ACME', repo_name: 'R' }),
    ).toThrow(/UNIQUE/);
  });
});

describe('SQLインジェクション耐性', () => {
  it('status 絞り込みや値に SQL を入れても、ただの文字列として扱われる', async () => {
    const repo = new SqliteRequestRepository(db);
    const evil = "x'; DROP TABLE provisioning_requests; --";
    await repo.createOrGet({
      id: 'i1',
      idempotencyKey: 'key-11111111',
      requestHash: 'h',
      now: 't',
      spec: makeSpec({ description: evil }),
    });
    expect((await repo.findById('i1'))?.spec.description).toBe(evil);
    // 不正な status は(バインド変数なので)単に0件。テーブルは無事
    const page = await repo.list({ limit: 10, offset: 0, status: evil as never });
    expect(page.total).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM provisioning_requests').get()).toEqual({ n: 1 });
  });
});

describe('永続化とエラー', () => {
  it('ファイルDBに保存され、開き直しても読める。親ディレクトリは自動作成される', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-test-'));
    try {
      const path = join(dir, 'nested', 'app.sqlite');
      const first = openDatabase(path);
      await new SqliteRequestRepository(first).createOrGet({
        id: 'p1',
        idempotencyKey: 'key-persist1',
        requestHash: 'h',
        now: 't',
        spec: makeSpec(),
      });
      first.close();

      const second = openDatabase(path);
      expect((await new SqliteRequestRepository(second).findById('p1'))?.id).toBe('p1');
      expect(second.pragma('journal_mode', { simple: true })).toBe('wal');
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('DB障害は PersistenceError に包まれる(SQLの詳細は cause に)', async () => {
    const repo = new SqliteRequestRepository(db);
    db.close();
    await expect(repo.findById('x')).rejects.toBeInstanceOf(PersistenceError);
    await expect(repo.list({ limit: 1, offset: 0 })).rejects.toBeInstanceOf(PersistenceError);
    await expect(
      repo.createOrGet({
        id: 'i',
        idempotencyKey: 'key-closed01',
        requestHash: 'h',
        now: 't',
        spec: makeSpec(),
      }),
    ).rejects.toBeInstanceOf(PersistenceError);
    await expect(
      repo.transition('i', 'PENDING', { to: 'PROCESSING', now: 't' }),
    ).rejects.toBeInstanceOf(PersistenceError);
    await expect(repo.findStale(['PENDING'], 't')).rejects.toBeInstanceOf(PersistenceError);
  });

  it('DB上の不整合(必須列がNULL)は検知してエラーにする', async () => {
    db.pragma('ignore_check_constraints = ON'); // 制約を回避して不正な行を作る(通常は作れない)
    insertRaw({ status: 'PROCESSING' }); // started_at が NULL
    await expect(new SqliteRequestRepository(db).findById('a')).rejects.toThrow(/started_at/);
  });
});
