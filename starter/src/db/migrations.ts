import type Database from 'better-sqlite3';
import { NotImplementedError } from '../shared/not-implemented.js';

export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

// TODO(ex09): provisioning_requests テーブルを作るマイグレーションを書く(docs/exercises/09-database.md)
export const MIGRATIONS: readonly Migration[] = [];

// TODO(ex09): 未適用のマイグレーションを順に適用し、適用した id の配列を返す
export function migrate(
  _db: Database.Database,
  _migrations: readonly Migration[] = MIGRATIONS,
): number[] {
  throw new NotImplementedError('09');
}
