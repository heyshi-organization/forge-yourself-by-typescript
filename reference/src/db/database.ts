import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from './migrations.js';

/**
 * SQLiteを開いてマイグレーションを適用する。
 * ':memory:' ならメモリDB(テスト用)。ファイルの場合は親ディレクトリを作る。
 */
export function openDatabase(path: string): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL'); // 読み取りと書き込みが互いをブロックしにくい
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000'); // ロック競合時に即エラーにせず最大5秒待つ
  migrate(db);
  return db;
}
