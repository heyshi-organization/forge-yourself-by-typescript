import type Database from 'better-sqlite3';

export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

// @starter-begin ex09
/**
 * マイグレーション(スキーマ変更の履歴)。一度適用したものは書き換えず、変更は新しい番号で追加する。
 *
 * 設計メモ:
 * - STRICT テーブル: 列の型を厳密に検査する(SQLiteは通常、型に緩い)
 * - CHECK制約: 不正な状態をDBレベルでも防ぐ(アプリのバグの最後の砦)
 * - idempotency_key の UNIQUE: 冪等性の核。アプリ側のチェックだけでは競合に負ける
 * - 部分ユニークインデックス: 同じリポジトリに対する処理中の要求を1件に制限する
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'create_provisioning_requests',
    sql: `
      CREATE TABLE provisioning_requests (
        id               TEXT PRIMARY KEY,
        idempotency_key  TEXT NOT NULL UNIQUE,
        request_hash     TEXT NOT NULL,
        status           TEXT NOT NULL
                         CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED')),
        owner            TEXT NOT NULL,
        owner_type       TEXT NOT NULL CHECK (owner_type IN ('user','organization')),
        repo_name        TEXT NOT NULL,
        description      TEXT,
        visibility       TEXT NOT NULL CHECK (visibility IN ('public','private')),
        auto_init        INTEGER NOT NULL CHECK (auto_init IN (0,1)),
        topics_json      TEXT NOT NULL CHECK (json_valid(topics_json)),
        github_repo_id   INTEGER,
        github_full_name TEXT,
        github_html_url  TEXT,
        github_created_at TEXT,
        warnings_json    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)),
        error_code       TEXT,
        error_message    TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        started_at       TEXT,
        finished_at      TEXT,
        CHECK ((status = 'SUCCEEDED') = (github_repo_id IS NOT NULL)),
        CHECK ((status = 'FAILED') = (error_code IS NOT NULL)),
        CHECK ((status IN ('PENDING')) = (started_at IS NULL)),
        CHECK ((status IN ('SUCCEEDED','FAILED')) = (finished_at IS NOT NULL))
      ) STRICT;

      CREATE INDEX idx_requests_created ON provisioning_requests (created_at DESC, id DESC);
      CREATE INDEX idx_requests_status_updated ON provisioning_requests (status, updated_at);
      CREATE UNIQUE INDEX uq_requests_in_flight_repo
        ON provisioning_requests (owner COLLATE NOCASE, repo_name COLLATE NOCASE)
        WHERE status IN ('PENDING','PROCESSING');
    `,
  },
];

/** 未適用のマイグレーションを順に適用する。1件ずつトランザクションで囲む。 */
export function migrate(
  db: Database.Database,
  migrations: readonly Migration[] = MIGRATIONS,
): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[]).map((r) => r.id),
  );
  const done: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.id - b.id)) {
    if (applied.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        m.id,
        m.name,
        new Date().toISOString(),
      );
    })();
    done.push(m.id);
  }
  return done;
}
// @starter-else
//| // TODO(ex09): provisioning_requests テーブルを作るマイグレーションを書く(docs/exercises/09-database.md)
//| export const MIGRATIONS: readonly Migration[] = [];
//|
//| // TODO(ex09): 未適用のマイグレーションを順に適用し、適用した id の配列を返す
//| export function migrate(_db: Database.Database, _migrations: readonly Migration[] = MIGRATIONS): number[] {
//|   throw new NotImplementedError('09');
//| }
// @starter-end
