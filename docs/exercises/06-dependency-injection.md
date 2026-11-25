# 課題06: 依存性の注入(DI)とサービス層

**週6** / 実装場所: `starter/src/db/in-memory-request-repository.ts`, `starter/src/services/provisioning-service.ts`(`get` `list` `process`), `starter/src/composition.ts`

## 1. 課題の目的

「依存を自分で作らず、外から受け取る」設計(DI)を体験する。サービス層を、**保存先(DB)も外部(GitHub)も知らずに**書き、テストでは Fake を、本番では本物を差し込む。

## 2. 学習する概念

SOLID(特に **S**ingle Responsibility / **D**ependency Inversion)/ インターフェース(ポート)/ コンストラクタ注入 / Composition Root / インメモリ実装(Fake)/ スタブ / compare-and-set / 契約テスト

## 3. 背景知識

### DI なし vs あり

```ts
// DIなし: 中で new している → テストでGitHubに本当に接続してしまう / 差し替えられない
class Service {
  private github = new OctokitGitHubClient({ token: process.env.GITHUB_TOKEN! });
}

// DIあり: 必要なもの(インターフェース)を外から受け取る
class Service {
  constructor(private readonly github: GitHubClient) {}
}
// 本番: new Service(new OctokitGitHubClient(...))   テスト: new Service(new FakeGitHubClient())
```

### このプロジェクトの依存関係

```
ProvisioningService ──使う──▶ RequestRepository(インターフェース)  ◀── InMemory / SQLite が実装
                    ──使う──▶ RepositoryProvisioner(インターフェース) ◀── ResilientProvisioner が実装
                    ──使う──▶ Clock / IdGenerator / AppLogger
```

**インターフェースは「使う側」の都合で決める**(使う側が必要なメソッドだけ)。実装クラスの `import` は、`composition.ts` にだけ書く。
時計・ID・乱数も注入する: `new Date()` を直接呼ぶと、テストで時刻を固定できない。

### 状態遷移の原子性(compare-and-set)

「PENDING なら PROCESSING にする」を、`確認 → 更新` の2段階で書くと、`await` の間に別の処理が割り込める。
**`transition(id, from, target)` は「現在の状態が `from` のときだけ更新し、そうでなければ `null` を返す」**1操作として実装する。これで、同じ要求を2つの処理が同時に進めようとしても、先に成功した1つだけが実行権を得る。

### 契約テスト

`InMemoryRequestRepository`(この課題)と `SqliteRequestRepository`(課題09)に、**同じテスト**(`test-support/repository-contract.ts`)を実行する。Fake が本物と食い違わないことを保証する。

## 4. 実装する機能

インターフェース(`db/request-repository.ts` / `provisioning/types.ts`)は**用意済み**。読んで、各メソッドのコメントの意味を理解すること。

### `db/in-memory-request-repository.ts` — `InMemoryRequestRepository implements RequestRepository`

`Map<string, RepositoryRequest>` に保存する。

| メソッド                           | 仕様                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createOrGet(input)`               | 同じ `idempotencyKey` が既にあれば `{ request: 既存, created: false }`。無ければ、**同じ owner/name(大文字小文字を区別しない)の `PENDING`/`PROCESSING` が別にないか**確認し、あれば `InFlightConflictError`。なければ `PENDING` で保存して `{ request, created: true }`(`createdAt` = `updatedAt` = `input.now`) |
| `findById(id)`                     | 無ければ `null`                                                                                                                                                                                                                                                                                                  |
| `list({ limit, offset, status? })` | 作成日時の**新しい順**(同時刻は `id` の降順)。`status` で絞り込み。`sliceToPage` を使う                                                                                                                                                                                                                          |
| `transition(id, from, target)`     | 現在の状態が `from` でなければ `null`。許されない遷移なら `assertTransition` が例外(課題01)。`PROCESSING`: `startedAt = now` / `SUCCEEDED`: `repository` `warnings` `finishedAt` / `FAILED`: `error` `finishedAt`。`updatedAt = now`。`SUCCEEDED`/`FAILED` の `startedAt` は引き継ぐ                             |
| `findStale(statuses, olderThan)`   | 指定の状態で、`updatedAt < olderThan` のもの                                                                                                                                                                                                                                                                     |

### `services/provisioning-service.ts`(この課題の範囲)

| メソッド           | 仕様                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get(id)`          | 無ければ `AppError('NOT_FOUND')`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `list(filter)`     | リポジトリにそのまま委譲                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `process(request)` | 次の順に行い、**最終的な要求(SUCCEEDED/FAILED)**を返す。① `transition(id, 'PENDING', { to: 'PROCESSING', now })`。`null`(他の処理が先に取った)か `PROCESSING` にならなければ `AppError('REQUEST_IN_PROGRESS', { requestId, retryAfterSeconds: 5 })` ② `provisioner.provision(spec, { requestId, startedAt, logger })` ③ プロビジョナーが**想定外の例外**を投げても、`PROCESSING` のまま残さず `err({ code: 'INTERNAL_ERROR', cause })` として扱う ④ 結果を保存: 成功なら `SUCCEEDED`(`repository`, `warnings`)、失敗なら `FAILED`(`error: { code, message }`。`message` は **`ERROR_CATALOG[code].message`**(定型文)。**内部の `cause` は保存しない**) |

> 結果の保存は、`submit`(課題10)の復旧処理(`recover`)でも使う。private メソッド(例: `finalize`)に切り出しておくと、課題10で使い回せる。
> 保存時に `transition(...)` が `null` を返したら(復旧処理が先に確定させた)、`findById` で最新を返す(課題10で必要になる。この課題では省略してよい)。

### `composition.ts` — `buildContainer(config, overrides?)`

**Composition Root**。設定から、本物の依存を組み立てる(`Overrides` の各項目があれば、そちらを優先)。

| 部品        | 本番(既定)                                                                                                                                              | `overrides` で差し替え                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| logger      | `createLogger(config.logLevel)`                                                                                                                         | `logger`                                                         |
| clock       | `systemClock`                                                                                                                                           | `clock`                                                          |
| ids         | `uuidGenerator`                                                                                                                                         | `ids`                                                            |
| requests    | `openDatabase(config.dbPath)` → `new SqliteRequestRepository(db)`                                                                                       | `requests`(指定したらDBは**開かない**。`container.db` は `null`) |
| github      | `config.githubClient === 'fake'` なら `new FakeGitHubClient({ clock, simulateByName: true })`、そうでなければ `new OctokitGitHubClient({ token })`      | `github`                                                         |
| provisioner | `new ResilientProvisioner({ github, timeoutMs, retryPolicy: { maxAttempts: config.githubMaxAttempts, baseDelayMs: 500, maxDelayMs: 10_000 }, sleep? })` | `provisioner`                                                    |
| service     | `new ProvisioningService({ requests, provisioner, clock, ids, logger, leaseMs: config.processingLeaseMs })`                                             |                                                                  |
| app         | `buildApp({ service, logger })`                                                                                                                         |                                                                  |

戻り値 `{ app, service, db, close() }`。`close()` は `app.close()` と(あれば)`db.close()`。

## 5. 実装対象ファイル

1. `starter/src/db/in-memory-request-repository.ts`
2. `starter/src/services/provisioning-service.ts`(`get` `list` `process`)
3. `starter/src/composition.ts`

(`ResilientProvisioner`(課題08)と `SqliteRequestRepository`(課題09)は未実装でも、`new` するコードを書くだけなら進められる。実際に動かすのは課題09以降。テストは両方をスタブ/インメモリで差し替えて検証する)

## 6. 受け入れ条件

- [ ] `InMemoryRequestRepository` が**契約テスト**をすべて通る(重複キー・処理中の同一リポジトリ・遷移・一覧・findStale)
- [ ] `process`: 成功 → `SUCCEEDED`(`startedAt`/`finishedAt`/`repository`/`warnings` が保存される)
- [ ] `process`: 失敗 → `FAILED`(コードと**定型メッセージ**。`cause` の内容は保存されない)
- [ ] `process`: プロビジョナーが例外を投げても `FAILED(INTERNAL_ERROR)` で終わる(`PROCESSING` のまま残らない)
- [ ] `process`: `PENDING` 以外の要求は処理せず `REQUEST_IN_PROGRESS`
- [ ] プロビジョナーには、**開始時刻 `startedAt`** と `requestId` を渡す
- [ ] `get` が無ければ `NOT_FOUND`(`AppError`)
- [ ] `buildContainer` が、`requests` / `provisioner` を差し替えて組み立てられ(SQLiteもGitHubも使わない)、`app.inject('/healthz')` が 200
- [ ] `new SqliteRequestRepository(`・`new OctokitGitHubClient(` が書かれているのは `composition.ts` だけ(`grep -rn "new SqliteRequestRepository" starter/src` で確認)

## 7. テスト方法

```bash
npm run exercise -- 06     # ex06-in-memory-repository(契約)/ ex06-service-and-di
grep -rn "new SqliteRequestRepository\|new OctokitGitHubClient" starter/src   # composition.ts だけのはず
```

## 8. 段階的なヒント

<details><summary>ヒント1: 進め方</summary>

① InMemory を契約テストで1つずつ緑に ② `ProvisioningService` の `get`/`list`/`process` ③ `buildContainer`。
`process` のテストは、プロビジョナーをスタブ(`{ provision: vi.fn(), reconcile: vi.fn() }`)にして、インメモリのリポジトリを渡している。**テストの `beforeEach` を読むと、DI のやり方そのものが分かる**。

</details>

<details><summary>ヒント2: transition の中身</summary>

```ts
const current = this.byId.get(id);
if (!current || current.status !== from) return null; // compare-and-set
assertTransition(from, target.to);
// target.to で場合分け(switch)して、新しい RepositoryRequest を作る → Map に保存 → 返す
```

`switch (target.to)` の各 case で、新しい状態のオブジェクトを `{ ...共通のフィールド, status: 'SUCCEEDED', ... }` で作る。TypeScript が、各 status に必要なフィールドが揃っているか検査してくれる(課題01の成果)。

</details>

<details><summary>ヒント3: process と buildContainer</summary>

```ts
// process のエラー処理の形
let outcome: ProvisionResult;
try { outcome = await provisioner.provision(...); }
catch (error) { outcome = err({ code: 'INTERNAL_ERROR', cause: error }); }
```

`buildContainer` は、上の表を**上から順に**書くだけ。`overrides.requests ? null : openDatabase(...)` のように、差し替えられたら作らない。
`new` の引数の組み立てが長くなっても、**ここ(1か所)に集める**のが目的。

</details>

## 9. 発展課題

1. `ProvisioningService` を Single Responsibility の観点でレビューする。分けるなら何と何?
2. `InMemoryRequestRepository` にだけ、わざとバグ(例: 大文字小文字を区別する)を入れて、契約テストが検出することを確認する
3. 循環依存がないことを `npx madge --circular starter/src`(一時的に実行)で確認する
4. DI コンテナ(tsyringe 等)を使うと、`composition.ts` はどう変わる? 何が増える? [ADR-0003](../adr/0003-dependency-injection.md)と比較

## 10. 完了後に理解しておくべきこと

- DI = 「依存を外から渡す」。インターフェースに依存すると、差し替え(テスト・将来の変更)が容易になる
- `new` を書く場所を1か所(Composition Root)に集めると、依存関係が見える
- Fake(インメモリ)は便利だが、**契約テスト**で本物と同じ振る舞いを保証しないと嘘をつく
- 時間・ID・乱数も「依存」。注入すると、テストが決定的になる
- 状態遷移を「確認してから更新」ではなく、**1操作(compare-and-set)**にする理由
