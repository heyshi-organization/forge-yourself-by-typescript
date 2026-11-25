# 課題08: エラーハンドリング(分類・リトライ・ログの秘匿)

**週8** / 実装場所: `starter/src/github/classify.ts`, `starter/src/provisioning/resilient-provisioner.ts`, `starter/src/logging/redact.ts`

## 1. 課題の目的

外部API(GitHub)の失敗は多様で、**対処が失敗の種類で全く違う**。
(1) 失敗を**分類**し、(2) 再試行してよいものだけを**再試行**し、(3) **結果が分からない失敗**でも重複作成せず、(4) 利用者に返すもの・ログに残すものを分け、(5) **秘密をログに出さない**。

## 2. 学習する概念

カスタムエラー / `cause` / 例外の分類 / `unknown` の絞り込み / 網羅的な `switch` / リトライの可否 / **曖昧な失敗(ambiguous)と冪等でない操作** / 構造化ログ / 秘密の伏せ字(redaction)/ 再帰的なデータ変換と循環参照

## 3. 背景知識

### GitHub の失敗の種類

| 状況                 | HTTP                                      | 分類(kind)    | 再試行        | 利用者へのエラーコード      |
| -------------------- | ----------------------------------------- | ------------- | ------------- | --------------------------- |
| トークンが無効       | 401                                       | `auth`        | ✗             | `GITHUB_AUTH_FAILED`        |
| 権限不足             | 403                                       | `permission`  | ✗             | `GITHUB_PERMISSION_DENIED`  |
| **レート制限**       | 403 / 429                                 | `rate_limit`  | ✓(待てるなら) | `GITHUB_RATE_LIMITED`       |
| 同名リポジトリが存在 | 422(errors に "already exists")           | `conflict`    | ✗             | `REPOSITORY_ALREADY_EXISTS` |
| その他の入力不正     | 422 / 他の4xx                             | `rejected`    | ✗             | `GITHUB_REJECTED`           |
| 存在しない           | 404                                       | `not_found`   | ✗             | `GITHUB_REJECTED`           |
| GitHub側の障害       | 5xx(レスポンスあり)                       | `unavailable` | ✓             | `GITHUB_UNAVAILABLE`        |
| 接続できない         | status 無し / status 500 でレスポンス無し | `network`     | ✓             | `GITHUB_UNAVAILABLE`        |
| こちらのタイムアウト | `TimeoutError` / `AbortError`             | `timeout`     | ✓             | `GITHUB_TIMEOUT`            |
| 分からない           | その他                                    | `unknown`     | ✗             | `INTERNAL_ERROR`            |

**レート制限の見分け方**(GitHubは通常の403と同じステータスで返す):

- ステータスが 429、または
- `x-ratelimit-remaining` が `'0'`、または `retry-after` ヘッダがある、または メッセージに "rate limit" を含む
- 待ち時間: `retry-after`(秒)→ ミリ秒。なければ `x-ratelimit-reset`(エポック秒)− 現在時刻。どちらも無ければ不明

Octokit のエラー(`RequestError`)の形(分類に使う部分): `{ status: number, message: string, response?: { headers: {...}, data: {...} } }`。
入力は `unknown` として受け取り、**想定外の値(`null`・文字列など)でも例外を投げず `unknown` に分類する**。

### 「結果が分からない失敗」(最重要)

```
Prov ──POST(作成)──▶ GitHub      ← GitHub は作成に成功した
Prov ◀── (応答が届かない・タイムアウト)  ← 失敗に「見える」
Prov ──POST(再試行)──▶ GitHub: 422 すでに存在する   ← 自分が作ったのに「重複」と言われる
```

`timeout` / `network` / `unavailable` / `unknown` は `ambiguous`(用意済みの `GitHubApiError.ambiguous`)。
この後の再試行で `conflict` が返ったら、**他人が作ったと断定せず**、`getRepository` で `createdAt` を見て、**今回の処理の開始時刻(−許容幅)以降**なら「前回の試行で作られた」とみなして成功にする。

### ログの秘匿

ログは多くの場所(ファイル・集約基盤・Actionsログ)に残り、**一度出たら消せない**。トークンは出力前に伏せる。

- **キー名**で伏せる: `token` `secret` `password` `authorization` `apiKey` `cookie` `privateKey` を含むキー(大文字小文字を区別しない)の**値は丸ごと**
- **値の形**で伏せる: GitHub のトークン(`ghp_` `gho_` `ghu_` `ghs_` `ghr_` + 英数字20文字以上、`github_pat_` + 20文字以上)、`Bearer xxx`/`token xxx`(値8文字以上)、URL内の認証情報(`https://user:pass@host` の `user:pass`)

## 4. 実装する機能

### `github/classify.ts`(`GitHubApiError` / `GitHubErrorKind` / `TimeoutError` は用意済み)

| 関数                                                                    | 仕様                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classifyGitHubError(error: unknown, now = new Date()): GitHubApiError` | 上の分類表のとおり。すでに `GitHubApiError` ならそのまま返す。`TimeoutError`→`timeout`。`error.name === 'AbortError'` →**status に関係なく** `timeout`(Octokit は AbortError に `status=500` を付けて投げる)。`status` を `GitHubApiError` の `options.status` に、レート制限の待ち時間を `options.retryAfterMs` に、元のエラーを `options.cause` に入れる |
| `isRetryableGitHubError(error)`                                         | 表の「再試行」列。`switch` を**網羅的**にする(`kind` が増えたらコンパイルエラーで気づける)                                                                                                                                                                                                                                                                 |
| `toErrorCode(kind)`                                                     | 表の「エラーコード」列。同じく網羅的に                                                                                                                                                                                                                                                                                                                     |

### `provisioning/resilient-provisioner.ts` — `ResilientProvisioner`

`options`: `{ github, timeoutMs, retryPolicy, skewToleranceMs?(既定60000), sleep?, random? }`。戻り値は `Result<ProvisionSuccess, ProvisionFailure>`(**例外を投げない**)。

共通の呼び出し口 `call(operation, context, fn, recover?)`(private メソッド)を作ると全体がすっきりする: `retry(...)` で包み、**1回ごと**に `withTimeout(fn, timeoutMs)`、失敗は `classifyGitHubError`、`isRetryable` は `GitHubApiError` かつ `isRetryableGitHubError`、`delayHintMs` は `error.retryAfterMs`。
**1回の呼び出しごとに**ログ(`context.logger`)を1行: `{ requestId, operation, attempt, outcome: 'ok'|'error', kind?, status?, durationMs }`。再試行するとき `{ requestId, operation, attempt, delayMs }`。

| メソッド                   | 仕様                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `provision(spec, context)` | ① `ownerType === 'user'` なら `getAuthenticatedLogin` で認証ユーザーを取得し、`owner` と(大文字小文字を区別せず)一致しなければ `err({ code: 'OWNER_MISMATCH' })`(作成は呼ばない)② `createRepository`(**リトライあり**)。失敗が `ambiguous` なら記録し、その後 `conflict` が来たら `getRepository` で確認 → `createdAt >= Date.parse(context.startedAt) − skewToleranceMs` なら**作成済みのもの**として成功にする ③ 結果が不明なまま諦めたとき、**最後に1回だけ** `getRepository`(リトライなし)で作成済みか確認し、あれば成功にする ④ `spec.topics` があれば `replaceTopics`(リトライあり)。**失敗してもリポジトリは作成済みなので成功**とし、`warnings: ['TOPICS_NOT_APPLIED']` ⑤ 失敗は `RetryExhaustedError` なら `lastError` を取り出し、`GitHubApiError` なら `{ code: toErrorCode(kind), cause }`、それ以外は `{ code: 'INTERNAL_ERROR', cause }` |
| `reconcile(spec, context)` | `getRepository`(リトライあり)。**無い** → `err('INTERRUPTED')`。**ある**が `createdAt` が古い(今回の処理で作られたものではない)→ `err('REPOSITORY_ALREADY_EXISTS')`。**ある**かつ今回の処理で作られた → topics を設定して成功(`finish`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### `logging/redact.ts`

| 関数                                                    | 仕様                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redactString(value)`                                   | 文字列中の秘密の形(上の「値の形」)を `[REDACTED]`(定数 `REDACTED`)に置換。URL内の認証情報は `https://[REDACTED]@host` の形で、ホストは残す                                                                                                                                                                            |
| `redactSecrets(value, depth = 0, seen = new WeakSet())` | 値から秘密を除いた**コピー**を返す(元は変更しない)。文字列 → `redactString`。キー名が秘密っぽいキーの値 → `[REDACTED]`。配列・オブジェクトは再帰(階層 8 を超えたら `'[TRUNCATED]'`、**循環参照**は `'[CIRCULAR]'`)。`Error` → `{ name, message(伏せ字済み), stack(伏せ字済み), cause(再帰) }`。プリミティブはそのまま |

## 5. 実装対象ファイル

`starter/src/github/classify.ts` → `starter/src/logging/redact.ts` → `starter/src/provisioning/resilient-provisioner.ts`(この順が楽)

## 6. 受け入れ条件

- [ ] 分類表のとおり分類される(401/403/403+レート制限の3パターン/429/404/422(重複・その他)/5xx/接続エラー/AbortError(status=500でも)/`TimeoutError`)。想定外の値でも例外を投げない。元のエラーが `cause` に残る
- [ ] 再試行は `rate_limit` `unavailable` `network` `timeout` だけ。すべての `kind` がカタログのコードに対応
- [ ] **認証/権限/重複/入力不正は、1回で諦める**(待たない)
- [ ] 一時障害(503)は再試行して回復する。待ち時間は指数バックオフ。使い切ったら `GITHUB_UNAVAILABLE`
- [ ] `Retry-After` の分だけ待つ。**長すぎる**(上限超)なら待たずに `GITHUB_RATE_LIMITED`
- [ ] 応答しない相手には、タイムアウトして `GITHUB_TIMEOUT`(試行回数ぶん)
- [ ] **タイムアウトしたが実は作成済み**のとき、再試行の `conflict` を「自分が作った」と判定して成功にし、**リポジトリは1つしか作られない**
- [ ] **以前から存在した**同名リポジトリは、自分が作ったとは判定しない(`REPOSITORY_ALREADY_EXISTS`)
- [ ] topics の失敗は警告(`TOPICS_NOT_APPLIED`)つきの成功。`ownerType=user` で owner 不一致 → `OWNER_MISMATCH`
- [ ] `reconcile` の3パターン(成功 / `INTERRUPTED` / `REPOSITORY_ALREADY_EXISTS`)
- [ ] 試行ごとに、構造化ログ(operation/attempt/outcome/kind/status/durationMs)が出る
- [ ] **トークンがどんな形・位置で出ても、ログ出力に残らない**(Property-based テストで確認される)

## 7. テスト方法

```bash
npm run exercise -- 08     # ex08-classify / ex08-provisioner / ex08-redact
```

`ex08-provisioner.test.ts` は `FakeGitHubClient`(失敗を差し込める: `enqueue('createRepository', { type: 'fail', error })` / `'hang'` / `'succeed-then-fail'`)を使う。**Fake の使い方を読む**と、障害の再現のしかたが学べる。

## 8. 段階的なヒント

<details><summary>ヒント1: classifyGitHubError の骨組み</summary>

```ts
if (error instanceof GitHubApiError) return error;
if (error instanceof TimeoutError)
  return new GitHubApiError('timeout', error.message, { cause: error });
if (typeof error !== 'object' || error === null)
  return new GitHubApiError('unknown', '...', { cause: error });
// ここから error は object。name / status / message / response を安全に読む(型ガードの小さな関数を作る)
// AbortError → status → ... の順に if を並べる(早期 return)
```

レスポンスヘッダは `error.response?.headers?.['retry-after']` のように**オプショナルチェーン**で。値は `string | number` の可能性がある。

</details>

<details><summary>ヒント2: ResilientProvisioner の構造</summary>

`private call<T>(operation, context, fn, recover?)` が、`retry(async (attempt) => { try { return await withTimeout(fn, ...) } catch (raw) { const error = classifyGitHubError(raw); log...; throw error } }, { policy, isRetryable, delayHintMs, sleep, random, onRetry })` を返す。
`provision` は `try { ... } catch (error) { return err(this.toFailure(error)) }` で、**必ず `Result` を返す**。
`ambiguousSeen` は `provision` のローカル変数にして、`createRepository` 用の `recover` コールバック(失敗を見て、`ambiguous` を記録し、`conflict` なら確認する)から更新する。

</details>

<details><summary>ヒント3: redactSecrets の再帰</summary>

`seen: WeakSet<object>` に訪問済みを入れ、再訪したら `'[CIRCULAR]'`。`depth >= 8` なら `'[TRUNCATED]'`。
`Error` は `Object.entries` で列挙できない(`message` は列挙不可)ので、**先に** `instanceof Error` で分岐して `name` `message` `stack` `cause` を明示的に取り出す。
キー名の判定は `/token|secret|password|passwd|authorization|api[-_]?key|cookie|private[-_]?key/i`。

</details>

## 9. 発展課題

1. サーキットブレーカー: 連続して N 回失敗したら、一定時間 GitHub を呼ばずに即失敗する(`unavailable`)
2. `x-ratelimit-remaining` が少ないときに、事前に呼び出しを間引く
3. `Error` の `cause` の鎖をたどって、ログ用の「原因チェーン」を作る
4. 失敗の種類ごとの件数を、構造化ログから集計するスクリプトを書く(`jq` でもよい)

## 10. 完了後に理解しておくべきこと

- 失敗は**一括りにせず分類**する。分類が対処(再試行/諦める/誰に伝える)を決める
- **冪等でない操作(POST)のタイムアウト**は「失敗」ではなく「不明」。再試行の前に、状態を確認する設計が要る
- 利用者に返す情報とログに残す情報を分ける(内部情報の漏洩を防ぐ)
- 秘密のマスクは「保険」。**そもそも秘密をログに渡さない**ことが第一
- 網羅的な `switch`(`never`)で、分類を増やしたときの修正漏れを防ぐ
