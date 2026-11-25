# 課題09: データベース(SQLite)

**週9** / 実装場所: `starter/src/db/migrations.ts`, `starter/src/db/sqlite-request-repository.ts`

## 1. 課題の目的

作成要求を SQLite に保存する。**アプリのコードにバグがあっても、不正なデータが入らず、二重実行が起きない**ように、DB の機能(制約・トランザクション)を使って設計する。

## 2. 学習する概念

SQL(`CREATE TABLE` / `INSERT` / `SELECT` / `UPDATE`)/ SQLite の特徴(STRICT・WAL)/ 制約(`NOT NULL` `UNIQUE` `CHECK`)/ インデックス(部分ユニーク)/ トランザクション / **バインド変数**(SQLインジェクション対策)/ マイグレーション / 行 ↔ ドメインモデルの変換 / better-sqlite3 の同期API

## 3. 背景知識

### better-sqlite3 の基本

```ts
import Database from 'better-sqlite3';
const db = new Database(':memory:'); // メモリDB(テスト用)
db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER) STRICT;');
db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').run('a', 1); // 位置パラメータ ?
const row = db.prepare('SELECT * FROM t WHERE id = ?').get('a'); // 1行(無ければ undefined)
const rows = db.prepare('SELECT * FROM t WHERE n > ?').all(0); // 全行
const result = db.prepare('UPDATE t SET n = ? WHERE id = ?').run(2, 'a'); // result.changes = 更新行数
const tx = db.transaction(() => {
  /* 複数の操作。例外が出たら全部ロールバック */
});
tx();
```

**同期API**: `await` が要らない(DB操作の最中に、他のリクエストの処理は割り込めない)。このプロジェクトでは、将来別のDBに替えられるよう、**Repositoryのメソッドは Promise を返す**(`async`)。

### 設計の指針([docs/database-design.md](../database-design.md) を読む前に、自分でテーブルを設計してみよう)

- **制約で守る**: アプリが検証していても、DBにも制約を置く(バグ・手作業での更新・将来の別のコードから守る)
- **状態と列の整合**: `SUCCEEDED` なのに GitHub のリポジトリ情報が無い行は**作れない**ように `CHECK`
- **冪等性の最後の砦**: `idempotency_key` の `UNIQUE`
- **同じリポジトリの処理中は1件**: **部分ユニークインデックス**(`WHERE status IN ('PENDING','PROCESSING')`)。大文字小文字を区別しない(`COLLATE NOCASE`)
- **更新は compare-and-set**: `UPDATE ... WHERE id = ? AND status = ?` → `result.changes === 0` なら他の処理が先に進めた
- **SQLに値を埋め込まない**: **必ず `?`**。`'...' + value + '...'` は SQL インジェクション(課題11の演習01)
- 日時は ISO 8601 文字列(UTC): 文字列の大小比較がそのまま時系列の比較になる

### マイグレーション

スキーマの変更履歴を、番号つきで管理する。**適用済みのものは書き換えない**(変更は新しい番号で追加)。`schema_migrations` テーブルに適用済みの番号を記録し、未適用だけを順に適用する。1件ずつトランザクションにして、途中で失敗したら丸ごと取り消す。

## 4. 実装する機能

`Migration` 型 / `openDatabase`(PRAGMA設定 + `migrate` 呼び出し)/ `RequestRepository` インターフェースは**用意済み**。

### `db/migrations.ts`

|                                                  | 仕様                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIGRATIONS`                                     | `[{ id: 1, name: 'create_provisioning_requests', sql: ... }]`。テーブル `provisioning_requests` の仕様は **[database-design.md](../database-design.md)**(列・CHECK・インデックス)。`STRICT` テーブルにする                                                                                                    |
| `migrate(db, migrations = MIGRATIONS): number[]` | ① `schema_migrations(id INTEGER PK, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT` を `IF NOT EXISTS` で作る ② 適用済みの id を読む ③ 未適用を **id の昇順**に、**1件ずつトランザクションで**(`db.exec(sql)` と `schema_migrations` への INSERT)適用 ④ 今回適用した id の配列を返す(何もなければ `[]`) |

> 設計の問い: 制約の `CHECK` をどこまで書く? 書きすぎると? → [database-design.md](../database-design.md) の表と比べて、違いを説明できるように。

### `db/sqlite-request-repository.ts` — `SqliteRequestRepository(db)`

契約はインメモリ版(課題06)と**同じ**(`test-support/repository-contract.ts`)。違いは、SQL で実現すること。

| メソッド      | 実装の指針                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createOrGet` | **トランザクション内**で、`idempotency_key` で SELECT → あれば `{ created: false }`。無ければ INSERT(`PENDING`)。INSERT が**部分ユニークインデックス違反**なら `InFlightConflictError`。その他のDBエラーは `PersistenceError` |
| `findById`    | SELECT → 行を `RepositoryRequest` に変換                                                                                                                                                                                      |
| `list`        | `status` 指定があれば `WHERE status = ?`。`ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`。`total` は同じ条件の `COUNT(*)`                                                                                               |
| `transition`  | まず `assertTransition(from, target.to)`。`target.to` ごとの `UPDATE ... WHERE id = ? AND status = ?`。`changes === 0` なら `null`。成功なら読み直して返す                                                                    |
| `findStale`   | `status IN (?, ?, ...)`(状態の数だけ `?` を作る)と `updated_at < ?`。空の `statuses` は `[]`                                                                                                                                  |

**行 → ドメイン型の変換**: DB の行(スネークケース、NULL あり)を、課題01の判別可能Union に変換する関数を書く。`status` ごとに必須の列が NULL ならエラー(`PersistenceError`: DBの不整合)。`topics_json` は `JSON.parse`。
DBの例外は `PersistenceError`(用意済み。`cause` に元の例外)に包む(**二重に包まない**)。SQLite のエラー: `error.code === 'SQLITE_CONSTRAINT_UNIQUE'`、`error.message` に違反した列が入る。

## 5. 実装対象ファイル

`starter/src/db/migrations.ts` → `starter/src/db/sqlite-request-repository.ts`

## 6. 受け入れ条件

- [ ] 契約テストを**インメモリ版と同じテスト**ですべて通る
- [ ] マイグレーション: 適用済みの履歴が残る / 2回実行しても何も起きない / 未適用だけが番号順に適用 / **失敗したマイグレーションは丸ごとロールバック**され履歴にも残らない
- [ ] DBの制約が効く: `idempotency_key` の重複 / 不正な `status` / SUCCEEDED なのに GitHub情報なし / FAILED なのに `error_code` なし / 不正なJSON / `STRICT`(型違い)/ 処理中の同一リポジトリ(大文字小文字を区別しない)
- [ ] **SQLインジェクション耐性**: `description` や `status` に SQL を入れても、ただの文字列として扱われる(テーブルが消えない)
- [ ] ファイルDBに保存され、開き直しても読める(`openDatabase` は用意済み)
- [ ] DBの障害(`db.close()` 後など)が `PersistenceError` になる。**二重に包まれていない**
- [ ] 不整合(必須列が NULL)を検知して、列名つきでエラーにする
- [ ] SQLに値を文字列連結していない(すべて `?`)

## 7. テスト方法

```bash
npm run exercise -- 09     # ex09-sqlite-repository(契約)/ ex09-sqlite-constraints
sqlite3 data/app.sqlite '.schema'     # sqlite3 CLI があれば、実際のスキーマを確認(アプリを動かした後)
```

## 8. 段階的なヒント

<details><summary>ヒント1: 進め方</summary>

テーブル定義 → `migrate` → `createOrGet` + `findById`(行の変換関数もここで)→ `transition` → `list` → `findStale`。
契約テストと制約テストを、**1つずつ**緑にする。テストの失敗メッセージ(`UNIQUE constraint failed: ...` など)が、何が足りないかのヒント。

</details>

<details><summary>ヒント2: CHECK 制約の書き方</summary>

「`status` が SUCCEEDED であることと、`github_repo_id` が NULL でないことは同値」は:
`CHECK ((status = 'SUCCEEDED') = (github_repo_id IS NOT NULL))`。他の状態と列も同様に(表は database-design.md)。
部分ユニークインデックス: `CREATE UNIQUE INDEX uq_... ON provisioning_requests (owner COLLATE NOCASE, repo_name COLLATE NOCASE) WHERE status IN ('PENDING','PROCESSING');`

</details>

<details><summary>ヒント3: transition と変換</summary>

```ts
const result = this.db
  .prepare(
    `UPDATE provisioning_requests SET status = 'PROCESSING', started_at = ?, updated_at = ? WHERE id = ? AND status = ?`,
  )
  .run(target.now, target.now, id, from);
if (result.changes === 0) return null;
```

行の変換は `switch (row.status)` で、各 status ごとに `need(row.started_at, 'started_at')`(NULLなら例外)のような小さなヘルパーを使うと読みやすい。`switch` を網羅的にすれば、戻り値の型が `RepositoryRequest` として成立する(課題01)。
一意制約違反の判定: `error.code === 'SQLITE_CONSTRAINT_UNIQUE' && error.message.includes('provisioning_requests.owner')`。

</details>

## 9. 発展課題

1. 試行履歴を持つ `request_attempts` テーブルを追加する**新しいマイグレーション**(番号2)を書く。外部キー制約も付ける
2. `EXPLAIN QUERY PLAN SELECT ... ORDER BY created_at DESC` で、インデックスが使われているか確認する
3. `OFFSET` ではなく、`(created_at, id)` を使った**キーセットページネーション**にする。メリット・デメリットは?
4. SQLite を `node:sqlite`(標準ライブラリ)に替えるとき、変更が必要な範囲を調べる([ADR-0001](../adr/0001-technology-selection.md)参照)

## 10. 完了後に理解しておくべきこと

- **制約で守る**: アプリ側の検証とは別に、DB が不正なデータを拒否する(多層防御)
- トランザクションと compare-and-set で、「確認してから更新」の競合を防ぐ
- バインド変数が SQLインジェクションを防ぐ理由(SQLの構造とデータを分離する)
- マイグレーションは「過去を書き換えず、追加する」
- Repository がインターフェースの裏で SQL を隠しているので、サービス層・テストは DB を意識しない
