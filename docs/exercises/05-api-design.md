# 課題05: API設計(Fastify)

**週5** / 実装場所: `starter/src/http/errors.ts`, `starter/src/http/app.ts`

## 1. 課題の目的

HTTP API の層を作る。ここの責務は「**受け取る → 検証する → サービスを呼ぶ → 返す**」だけ。ビジネス判断は持たず、エラーは**統一された形式**で、**内部情報を漏らさずに**返す。

## 2. 学習する概念

Fastify(ルート・フック・エラーハンドラ・`inject()`)/ HTTPメソッドとステータスコード / REST の基本 / エラー形式の設計 / 責務分離(ハンドラは薄く)/ 相関ID / セキュリティヘッダ / モジュール設計(依存の向き)

## 3. 背景知識

### Fastify の最小例

```ts
import Fastify from 'fastify';
const app = Fastify({ bodyLimit: 16 * 1024 });
app.get('/hello', async (request, reply) => ({ hello: 'world' })); // 返した値が JSON になる
app.post('/x', async (request, reply) => reply.status(201).send({ ok: 1 })); // ステータスを指定
app.setErrorHandler((error, request, reply) => {
  /* 例外が投げられたらここに来る */
});
app.addHook('onSend', async (request, reply) => {
  reply.header('x-foo', 'bar');
});

const res = await app.inject({ method: 'GET', url: '/hello' }); // ポートを開かずにテスト
res.statusCode;
res.json();
```

### 設計の方針

| 項目                | 方針                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ハンドラ            | 薄く。検証 → `service.xxx()` → 変換して返す。DB・GitHub・状態遷移の知識を持たない                                                                |
| エラー形式          | すべて `{ error: { code, message, correlationId, requestId?, details? } }`。**404・415・413・JSONの構文エラーも同じ形式**                        |
| `code` と `message` | `code` は機械向け(`errors/catalog.ts` のカタログ)、`message` は人向けの定型文(用意済み。`ERROR_CATALOG` を使う)                                  |
| 内部情報            | 想定外の例外の `message`・スタックトレース・DBの詳細は**返さない**(ログにだけ出す)。入力エラーは「どの項目が・なぜ」だけで、**入力値は返さない** |
| 相関ID              | `X-Correlation-Id` ヘッダ。リクエストにあれば、**安全な形式のときだけ**引き継ぐ。無い/不正なら新規発行(ログ汚染対策)                             |
| ステータス          | エラーカタログの `status`。FAILED の要求は、保存されているエラーコードに対応するステータスで返す                                                 |

用意されているもの(given): `errors/catalog.ts`(`ERROR_CATALOG` `ErrorCode` `isErrorCode`)、`errors/app-error.ts`(`AppError`)、`http/resource.ts`(`toRequestResource`: 内部の `RepositoryRequest` → 公開してよい JSON)、`http/openapi.ts`、`schemas/`(課題04)、`app.ts` 上部の `resolveCorrelationId` / `parseIdempotencyKey`。

## 4. 実装する機能

### `http/errors.ts`

| 関数                                      | 仕様                                                                                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sendError(request, reply, code, extra?)` | エラー形式で、カタログの `status` のレスポンスを返す。`message` はカタログの定型文。`correlationId` は `request.id`。`extra.requestId` / `extra.issues`(→`details`)/ `extra.retryAfterSeconds`(→ `Retry-After` ヘッダ)を、あれば含める |
| `toFieldIssues(zodError)`                 | `ZodError` → `[{ path: 'name', message }]`(パスは `.` でつなぐ。ルートは `(root)`)。**入力値は含めない**                                                                                                                               |
| `parseWith(schema, value)`                | `safeParse` して、失敗なら `VALIDATION_ERROR` の `AppError`(`issues` つき)を投げる。成功なら検証済みの値                                                                                                                               |
| `handleError(error, request, reply)`      | あらゆる例外を、利用者に返してよい形に変換する(下の表)                                                                                                                                                                                 |
| `coerceErrorCode(code)`                   | 文字列がカタログのコードならそのまま、そうでなければ `INTERNAL_ERROR`                                                                                                                                                                  |

`handleError` の変換:

| 例外                                               | レスポンス                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AppError`                                         | その `code`(`requestId` `issues` `retryAfterSeconds` も渡す)。500番台はログにも出す                                |
| `ZodError`                                         | `VALIDATION_ERROR` + `details`                                                                                     |
| Fastify 自身の 4xx(`error.statusCode` が 400〜499) | 415 → `UNSUPPORTED_MEDIA_TYPE`、413 → `PAYLOAD_TOO_LARGE`、それ以外 → `VALIDATION_ERROR`(詳細は `(body)` の定型文) |
| それ以外(想定外)                                   | **`INTERNAL_ERROR`(500)**。詳細は `request.log.error` にだけ                                                       |

### `http/app.ts` — `buildApp({ service, logger }): FastifyInstance`

- Fastify の設定: `loggerInstance: logger`、`genReqId: resolveCorrelationId`、`logController: new LogController({ requestIdLogLabel: 'correlationId' })`、`bodyLimit: 16 * 1024`
- `onSend` フック: `x-correlation-id`(= `request.id`)、`x-content-type-options: nosniff`、`cache-control: no-store`
- エラーハンドラ / 404 ハンドラを `errors.ts` に接続(404 は `NOT_FOUND`)
- ルート:

| ルート                            | 動作                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /healthz`                    | `{ status: 'ok' }`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GET /openapi.json`               | `buildOpenApiDocument()`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /v1/repository-requests`    | ① `parseIdempotencyKey(request)` ② ボディを `parseWith(createRepositoryBodySchema, ...)` ③ `service.submit({ spec: toRepositorySpec(body), idempotencyKey })` → `{ request, replayed }`。`replayed` なら `Idempotent-Replayed: true`。**`request.status === 'FAILED'` なら** `sendError`(`coerceErrorCode(request.error.code)`、`requestId`)。成功なら `Location: /v1/repository-requests/{id}` を付け、**新規は 201・再送は 200** で `toRequestResource(request)` |
| `GET /v1/repository-requests`     | `listQuerySchema` で検証 → `service.list(query)` → `{ items: [toRequestResource...], total, limit, offset }`                                                                                                                                                                                                                                                                                                                                                       |
| `GET /v1/repository-requests/:id` | `requestIdParamSchema` で検証 → `toRequestResource(await service.get(id))`                                                                                                                                                                                                                                                                                                                                                                                         |

## 5. 実装対象ファイル

`starter/src/http/errors.ts` → `starter/src/http/app.ts`(この順)。

## 6. 受け入れ条件

- [ ] 上のルートが、仕様どおり動く(ステータス・ヘッダ・ボディ)
- [ ] 存在しないパスも JSON のエラー形式で 404
- [ ] 入力エラーは 400 + `details`(項目名)。**入力値は返さない**。サービスは呼ばれない
- [ ] `Idempotency-Key` が無い/不正 → 400(`IDEMPOTENCY_KEY_REQUIRED` / `_INVALID`)
- [ ] 壊れたJSON → 400、`Content-Type` 違い → 415、16KB超 → 413
- [ ] FAILED の要求は、エラーコードに応じたステータス(`GITHUB_AUTH_FAILED`→502、`REPOSITORY_ALREADY_EXISTS`→409、`GITHUB_RATE_LIMITED`→503、`GITHUB_TIMEOUT`→504、未知のコード→500)
- [ ] サービスが `AppError(REQUEST_IN_PROGRESS, { retryAfterSeconds: 5 })` を投げたら 409 + `Retry-After: 5`
- [ ] 想定外の例外は 500 `INTERNAL_ERROR`。**例外のメッセージ(ファイルパス等)がレスポンスに含まれない**
- [ ] `X-Correlation-Id`: 安全な値は引き継ぎ、改行を含むなどの不正な値は新規発行
- [ ] レスポンスに `nosniff` / `no-store`
- [ ] 公開される JSON に `idempotencyKey` / `requestHash` が含まれない

## 7. テスト方法

```bash
npm run exercise -- 05      # ex05-api.test.ts(サービスはスタブ。課題06が未実装でも検証できる)
curl で手動確認はサービス(課題06・10)が動いてから。仕様は docs/api-specification.md
```

## 8. 段階的なヒント

<details><summary>ヒント1: 進め方</summary>

先に `errors.ts`。`sendError` が書ければ、404・エラーハンドラ・FAILEDの返却すべてで使える。
次に `buildApp` の骨組み(`Fastify({...})`・フック・エラーハンドラ・`/healthz`)→ `POST` → `GET`。テストを1つずつ緑にしていく。

</details>

<details><summary>ヒント2: handleError の分岐</summary>

`if (error instanceof AppError) {...}` → `if (error instanceof ZodError) {...}` → `const statusCode = (error as { statusCode?: unknown }).statusCode; if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {...}` → 最後が想定外。
`unknown` から `statusCode` を読むとき、`as` で形を主張するしかない場面は、**狭い範囲に閉じ込めて**コメントを書く。

</details>

<details><summary>ヒント3: POST の流れ</summary>

```ts
app.post('/v1/repository-requests', async (request, reply) => {
  const idempotencyKey = parseIdempotencyKey(request);   // 失敗すると AppError が投げられ、エラーハンドラへ
  const body = parseWith(createRepositoryBodySchema, request.body);
  const { request: result, replayed } = await service.submit({ spec: toRepositorySpec(body), idempotencyKey });
  ...
});
```

例外は**ハンドラ内で捕まえない**(エラーハンドラに任せる)。`async` ハンドラが値を `return` するのと、`reply.send` を呼ぶのを混ぜるときは、`return reply.status(...).send(...)` にする。

</details>

## 9. 発展課題

1. `Retry-After` を、レート制限の FAILED 応答にも付ける(保存する情報を増やす必要があるか考える)
2. 一覧に ETag を付け、`If-None-Match` に 304 を返す
3. `/v1` の次のバージョン `/v2` を追加するとき、何を共通化し、何を分けるか設計メモを書く
4. エラーを RFC 9457(`application/problem+json`)に合わせるとしたら、何が変わるか

## 10. 完了後に理解しておくべきこと

- ハンドラを薄く保つ理由(テスト容易性・責務分離)。ビジネス判断はサービス層
- エラー形式を**1か所で統一**する価値(クライアントが1通りの処理で済む)
- 「利用者に返す情報」と「ログに残す情報」を分ける理由(内部情報の漏洩)
- ステータスコードの選び方(特に、上流(GitHub)の認証エラーを 401/403 にしない理由)
- `inject()` で、ネットワークなしにAPIをテストできること
