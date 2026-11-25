# API仕様書

機械可読な仕様: **OpenAPI 3.1** — `GET /openapi.json`(起動中)、またはリポジトリの [`docs/openapi.json`](openapi.json)。
(Zod のスキーマから生成しており、コードと食い違うとテストが失敗する。[ADR-0016](adr/0016-api-scope-and-openapi.md))

ベースURL(既定): `http://127.0.0.1:3000` — **認証なし・ローカル専用**。

## 共通

| 項目       | 内容                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 形式       | リクエスト・レスポンスとも JSON(`Content-Type: application/json`)。ボディ上限 16KB                                                         |
| 相関ID     | レスポンスヘッダ `X-Correlation-Id`(リクエストに安全な `X-Correlation-Id`(英数字・`._-`、8〜64文字)があれば引き継ぐ)。問い合わせ時に伝える |
| 日時       | ISO 8601(UTC)                                                                                                                              |
| キャッシュ | `Cache-Control: no-store`                                                                                                                  |

### エラー形式(すべてのエラー共通)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値が不正です。",
    "correlationId": "2a44729f-8ba4-4400-bfed-a196afc7f4ab",
    "requestId": "d3b42cd2-5dcc-4bef-890c-f6011467ea5c",
    "details": [{ "path": "name", "message": "使えるのは英数字・ . _ - のみです" }]
  }
}
```

- `code`: 機械が見る。`message`: 人が読む定型文(内部情報を含まない)
- `requestId`: 作成要求に紐づくエラーのとき。`details`: 入力エラーのときだけ(入力値そのものは含まない)

### エラーコード一覧

| code                                              | HTTP      | 意味 / クライアントの対応                                          |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `VALIDATION_ERROR`                                | 400       | 入力が不正。`details` を見て直す                                   |
| `IDEMPOTENCY_KEY_REQUIRED` / `_INVALID`           | 400       | `Idempotency-Key` を付ける / 形式を直す                            |
| `NOT_FOUND`                                       | 404       | 存在しない                                                         |
| `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE`    | 413 / 415 | ボディが大きい / JSONで送る                                        |
| `IDEMPOTENCY_KEY_REUSED`                          | 422       | 同じキーで内容が違う。キーを使い回さない                           |
| `OWNER_MISMATCH`                                  | 422       | `ownerType=user` の owner が、サービスの認証ユーザーと違う         |
| `GITHUB_REJECTED`                                 | 422       | GitHub が内容を受け付けない(名前・説明など)                        |
| `REQUEST_IN_PROGRESS`                             | 409       | 同じキーの要求を処理中。`Retry-After` 秒後に GET で確認            |
| `REPOSITORY_REQUEST_IN_PROGRESS`                  | 409       | 同じリポジトリへの別の要求を処理中                                 |
| `REPOSITORY_ALREADY_EXISTS`                       | 409       | 同名のリポジトリが既にある。名前を変える                           |
| `GITHUB_AUTH_FAILED` / `GITHUB_PERMISSION_DENIED` | 502       | サービス側のGitHub認証・権限の問題。管理者に連絡                   |
| `GITHUB_RATE_LIMITED` / `GITHUB_UNAVAILABLE`      | 503       | しばらくして、**新しい Idempotency-Key** で再試行                  |
| `GITHUB_TIMEOUT`                                  | 504       | 同上(作成されている可能性があるので、再送前に一覧で確認するとよい) |
| `INTERRUPTED`                                     | 500       | 処理が中断され、作成を確認できなかった。新しいキーで再送           |
| `INTERNAL_ERROR`                                  | 500       | 内部エラー。`correlationId` を添えて管理者に連絡                   |

## `GET /healthz`

`200 {"status":"ok"}`

## `POST /v1/repository-requests` — リポジトリ作成要求(冪等)

### リクエスト

| ヘッダ                           | 必須 | 説明                                  |
| -------------------------------- | ---- | ------------------------------------- |
| `Idempotency-Key`                | ✅   | 8〜128文字 `[A-Za-z0-9_-]`。UUID 推奨 |
| `Content-Type: application/json` | ✅   |                                       |

| フィールド    | 型                           | 必須 | 制約                                                                                  |
| ------------- | ---------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `owner`       | string                       | ✅   | GitHub のユーザー名/Org名。英数字とハイフン、39文字以内、先頭末尾・連続のハイフン不可 |
| `ownerType`   | `"user"` \| `"organization"` | ✅   |                                                                                       |
| `name`        | string                       | ✅   | 1〜100文字、`[A-Za-z0-9._-]`、`.` `..` 不可、`.git` で終わらない                      |
| `visibility`  | `"public"` \| `"private"`    | ✅   |                                                                                       |
| `description` | string                       |      | 350文字以内、制御文字不可                                                             |
| `autoInit`    | boolean                      |      | 既定 false(README を作る)                                                             |
| `topics`      | string[]                     |      | 20個まで、各 `[a-z0-9][a-z0-9-]{0,49}`、重複不可。既定 `[]`                           |

**上記以外のフィールドは 400**(`strict`)。

```bash
curl -i -X POST http://127.0.0.1:3000/v1/repository-requests \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"owner":"acme","ownerType":"organization","name":"hello-world","visibility":"private","topics":["demo"]}'
```

### レスポンス

| ステータス    | 意味                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| `201 Created` | 作成できた。`Location: /v1/repository-requests/{id}`。ボディは下の「作成要求」           |
| `200 OK`      | **同じキーの過去の結果**(`Idempotent-Replayed: true`)。GitHub は呼ばれていない           |
| 4xx / 5xx     | 上のエラー形式。`FAILED` の要求を再送した場合も、同じエラー(`Idempotent-Replayed: true`) |

### 作成要求(`RequestResource`)

```json
{
  "id": "dc3572df-a6ea-4729-b528-c1fe5e97c850",
  "status": "SUCCEEDED",
  "spec": {
    "owner": "acme",
    "ownerType": "organization",
    "name": "hello-world",
    "description": null,
    "visibility": "private",
    "autoInit": false,
    "topics": ["demo"]
  },
  "repository": {
    "id": 1000,
    "fullName": "acme/hello-world",
    "htmlUrl": "https://github.com/acme/hello-world"
  },
  "warnings": [],
  "error": null,
  "createdAt": "2026-11-25T01:10:08.487Z",
  "updatedAt": "2026-11-25T01:10:08.488Z",
  "startedAt": "2026-11-25T01:10:08.487Z",
  "finishedAt": "2026-11-25T01:10:08.488Z"
}
```

- `status`: `PENDING` / `PROCESSING` / `SUCCEEDED` / `FAILED`
- `repository`: `SUCCEEDED` のときだけ。`error`: `FAILED` のときだけ(`code` と定型 `message`)
- `warnings`: 例 `["TOPICS_NOT_APPLIED"]` — リポジトリは作成できたが、topics の設定に失敗した
- `Idempotency-Key` と内部の `requestHash` は**返さない**

## `GET /v1/repository-requests` — 一覧

| クエリ   | 既定   | 制約                                              |
| -------- | ------ | ------------------------------------------------- |
| `limit`  | 20     | 1〜100                                            |
| `offset` | 0      | 0以上                                             |
| `status` | (全部) | `PENDING` / `PROCESSING` / `SUCCEEDED` / `FAILED` |

作成日時の**新しい順**。`200 {"items":[RequestResource...],"total":N,"limit":L,"offset":O}`。不正なクエリ・未知のクエリは 400。

## `GET /v1/repository-requests/{id}` — 詳細(処理状態・作成結果)

`200 RequestResource` / `404 NOT_FOUND`

## `GET /openapi.json` — OpenAPI 仕様
