# シーケンス図集

登場人物: `Client`(クライアント)、`HTTP`(`http/`)、`Service`(`ProvisioningService`)、`DB`(`RequestRepository`)、`Prov`(`ResilientProvisioner`)、`GH`(GitHub API)。
図は GitHub 上でそのまま表示される(Mermaid)。各図の下に「対応するテスト」を示す。

## 1. 正常なリポジトリ作成

```mermaid
sequenceDiagram
  participant Client
  participant HTTP
  participant Service
  participant DB
  participant Prov
  participant GH as GitHub API
  Client->>HTTP: POST /v1/repository-requests<br/>Idempotency-Key: K, body
  HTTP->>HTTP: キー・ボディを検証(Zod)
  HTTP->>Service: submit(spec, K)
  Service->>DB: createOrGet(K, hash, spec)
  DB-->>Service: PENDING(新規)
  Service->>DB: transition PENDING→PROCESSING
  Service->>Prov: provision(spec)
  opt ownerType = user
    Prov->>GH: GET /user(ownerの確認)
  end
  Prov->>GH: POST /orgs/{org}/repos
  GH-->>Prov: 201 {id, html_url, created_at}
  opt topics がある
    Prov->>GH: PUT /repos/{o}/{r}/topics
  end
  Prov-->>Service: ok(repository, warnings)
  Service->>DB: transition PROCESSING→SUCCEEDED
  Service-->>HTTP: SUCCEEDED
  HTTP-->>Client: 201 Created + Location
```

テスト: `reference/test/http/api.test.ts`「201: 作成でき…」、`exercises/tests/ex10-idempotency.test.ts`

## 2. 入力値検証エラー

```mermaid
sequenceDiagram
  participant Client
  participant HTTP
  participant Service
  Client->>HTTP: POST(name="../x", visibility="secret")
  HTTP->>HTTP: Zod で検証 → 失敗
  HTTP-->>Client: 400 VALIDATION_ERROR<br/>details: [name, visibility](入力値は返さない)
  Note over HTTP,Service: Service・DB・GitHub は呼ばれない。何も保存されない
```

テスト: `exercises/tests/ex05-api.test.ts`「入力の検証(サービスは呼ばれない)」

## 3. GitHub API 認証エラー(再試行しない)

```mermaid
sequenceDiagram
  participant Client
  participant HTTP
  participant Service
  participant DB
  participant Prov
  participant GH as GitHub API
  Client->>HTTP: POST
  HTTP->>Service: submit
  Service->>DB: createOrGet → PENDING → PROCESSING
  Service->>Prov: provision
  Prov->>GH: POST /orgs/acme/repos
  GH-->>Prov: 401 Bad credentials
  Prov->>Prov: 分類: auth(再試行しない)
  Prov-->>Service: err(GITHUB_AUTH_FAILED)
  Service->>DB: transition PROCESSING→FAILED(code, 定型メッセージ)
  Note over Service: 内部の詳細(GitHubの応答)はログにだけ出す
  Service-->>HTTP: FAILED
  HTTP-->>Client: 502 GITHUB_AUTH_FAILED(定型メッセージ + requestId)
```

テスト: `exercises/tests/ex08-provisioner.test.ts`「失敗(再試行しない)」、`api.test.ts`「GitHub の失敗がどう見えるか」

## 4. GitHub API タイムアウト

```mermaid
sequenceDiagram
  participant Prov
  participant GH as GitHub API
  loop 最大 maxAttempts 回
    Prov->>GH: POST(タイムアウト 10秒)
    Note over Prov,GH: 応答なし → withTimeout が signal を abort し TimeoutError
    Prov->>Prov: 分類: timeout(ambiguous=結果不明)
    Prov->>Prov: バックオフ(Full Jitter)で待つ
  end
  Prov->>GH: GET /repos/{o}/{r}(最後に1回だけ「作られていないか」確認)
  alt 今回の処理で作成済み
    Prov-->>Prov: ok(作成済みと判断)
  else 無い
    Prov-->>Prov: err(GITHUB_TIMEOUT) → 504
  end
```

テスト: `ex08-provisioner.test.ts`「応答しない相手には、タイムアウトして GITHUB_TIMEOUT」「曖昧な失敗が続いて諦めた場合…」

## 5. リトライ(一時障害・レート制限)

```mermaid
sequenceDiagram
  participant Prov
  participant GH as GitHub API
  Prov->>GH: POST(試行1)
  GH-->>Prov: 503
  Note over Prov: retryable → 待つ(0〜500ms)
  Prov->>GH: POST(試行2)
  GH-->>Prov: 429 Retry-After: 1
  Note over Prov: ヒントの1000ms だけ待つ(上限 maxDelayMs 以内)
  Prov->>GH: POST(試行3)
  GH-->>Prov: 201 Created
  Note over Prov: Retry-After が上限(10秒)超なら、待たずに GITHUB_RATE_LIMITED
```

テスト: `ex08-provisioner.test.ts`「リトライ」、`ex03-retry.test.ts`

### 5-2. 「結果が分からない失敗」のあとの再試行(重複作成の防止)

```mermaid
sequenceDiagram
  participant Prov
  participant GH as GitHub API
  Prov->>GH: POST(試行1)
  GH-->>GH: リポジトリを作成した!
  GH--xProv: 応答が届かない(タイムアウト)
  Note over Prov: ambiguous を記録
  Prov->>GH: POST(試行2)
  GH-->>Prov: 422 name already exists
  Note over Prov: 他人が作った、と断定しない
  Prov->>GH: GET /repos/{o}/{r}
  GH-->>Prov: created_at が「処理開始時刻 −60秒」以降
  Prov-->>Prov: 前回の試行で作られたもの → 成功扱い(二重作成なし)
```

テスト: `ex08-provisioner.test.ts`「タイムアウトしたが実は作成済み…」「以前から存在した同名リポジトリは…」

## 6. Idempotency-Key による重複要求

```mermaid
sequenceDiagram
  participant Client
  participant Service
  participant DB
  participant GH as GitHub API
  Client->>Service: POST (K, 内容X)
  Service->>DB: createOrGet(K) → 新規
  Service->>GH: 作成
  Service->>DB: SUCCEEDED
  Service-->>Client: 201
  Client->>Service: POST (K, 内容X) ← 再送(通信エラー等で)
  Service->>DB: createOrGet(K) → 既存(SUCCEEDED)
  Service-->>Client: 200 + Idempotent-Replayed: true(GitHubは呼ばない)
  Client->>Service: POST (K, 内容Y) ← キーの使い回し
  Service->>DB: createOrGet(K) → 既存、hash が違う
  Service-->>Client: 422 IDEMPOTENCY_KEY_REUSED
```

同時に2つ届いた場合: 先に `PENDING→PROCESSING` にできた1つだけが実行し、もう一方は 409 `REQUEST_IN_PROGRESS`(`Retry-After: 5`)。
テスト: `ex10-idempotency.test.ts`「submit: 冪等性」

## 7. DB 保存失敗

### 7-1. 最初の保存に失敗(まだ何もしていない)

```mermaid
sequenceDiagram
  participant Client
  participant HTTP
  participant Service
  participant DB
  Client->>HTTP: POST
  HTTP->>Service: submit
  Service->>DB: createOrGet
  DB--xService: PersistenceError(ディスクフルなど)
  Service--xHTTP: 例外
  HTTP-->>Client: 500 INTERNAL_ERROR(詳細は返さない。ログにだけ残す)
  Note over Service: GitHub は呼ばれていない → 安全に再送できる
```

### 7-2. GitHub では作成できたが、結果の保存に失敗(最も危険)

```mermaid
sequenceDiagram
  participant Client
  participant Service
  participant DB
  participant GH as GitHub API
  Client->>Service: POST (K)
  Service->>DB: PROCESSING
  Service->>GH: 作成 → 成功
  Service->>DB: transition → SUCCEEDED
  DB--xService: 失敗!
  Note over Service: ログに GitHub 側のリポジトリ名を残す。要求は PROCESSING のまま
  Service-->>Client: 500
  Client->>Service: POST (K) ← 再送(リース内)
  Service-->>Client: 409 REQUEST_IN_PROGRESS
  Note over Service: リース(既定5分)経過後
  Client->>Service: POST (K) ← 再送
  Service->>GH: GET /repos/{o}/{r}(reconcile)
  GH-->>Service: 今回の処理で作成されている
  Service->>DB: SUCCEEDED
  Service-->>Client: 200 + Idempotent-Replayed(二重作成なし)
```

テスト: `ex10-idempotency.test.ts`「障害: GitHubでは作成できたが、DBに結果を保存できなかった」、`api.test.ts`「SQLite への保存失敗」

## 8. プロセスが落ちた後の復旧(起動時)

```mermaid
sequenceDiagram
  participant Main as main.ts
  participant Service
  participant DB
  participant GH as GitHub API
  Main->>Service: recoverStale()
  Service->>DB: findStale([PENDING, PROCESSING], now − リース)
  DB-->>Service: 中断された要求の一覧
  loop 最大3件を並行で
    alt PENDING
      Service->>Service: 通常どおり process(GitHubはまだ呼んでいない)
    else PROCESSING
      Service->>GH: reconcile(作成済みか確認)
      alt 今回の処理で作成済み
        Service->>DB: SUCCEEDED
      else 無い
        Service->>DB: FAILED(INTERRUPTED)
      end
    end
  end
  Main->>Main: その後に HTTP の受付を開始
```

テスト: `ex10-idempotency.test.ts`「復旧(recoverStale)」
