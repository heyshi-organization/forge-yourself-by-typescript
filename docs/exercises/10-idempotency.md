# 課題10: 冪等性と障害からの復旧

**週10** / 実装場所: `starter/src/services/provisioning-service.ts`(`submit` / `recover` / `recoverStale`)

## 1. 課題の目的

「同じリクエストが重複して届いても、リポジトリが二重に作られない」を、**外部API呼び出しの途中でプロセスが落ちる・DB保存に失敗する**ケースまで含めて実現する。
この課題が終わると、`starter/` が**動くアプリ**になる。

## 2. 学習する概念

冪等性 / Idempotency-Key / 状態機械 / compare-and-set / **at-least-once と exactly-once の違い** / reconcile(突き合わせ)/ リース / 障害注入テスト / 並行制御(`mapWithConcurrency`)

## 3. 背景知識

### 失敗点を時系列に書き出す(**まず自分で書いてから** [ADR-0007](../adr/0007-idempotency.md) を読む)

```
(1) 要求をDBに保存(PENDING)
(2) PROCESSING にする
(3) GitHub に作成を依頼
(4) 結果をDBに保存(SUCCEEDED/FAILED)
```

それぞれの直後でプロセスが落ちたら? (3) の最中に落ちたら、GitHub では作られたのか?(4) だけ失敗したら?

> **考えてみよう**: 単に「GitHub に同名があるか先に確認して、無ければ作る」ではなぜダメ? (確認と作成の間に別の要求が割り込む / 確認できても、途中障害は救えない)

### 設計の要点(このプロジェクトの方針。ADR-0007)

|                  | 方針                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 重複の排除       | `Idempotency-Key` を DB の UNIQUE で守る。`createOrGet`(課題06・09)が原子的                                                                         |
| キーの使い回し   | 要求内容のハッシュ(`hashSpec`、用意済み)を比べ、同じキーで内容が違えば `IDEMPOTENCY_KEY_REUSED`(422)                                                |
| 再送の結果       | `SUCCEEDED` / `FAILED` はそのまま返す(**GitHubを再度呼ばない**)。`FAILED` を再実行しない=「同じキーなら同じ結果」を単純に保つ(やり直しは新しいキー) |
| 処理中の再送     | 409 `REQUEST_IN_PROGRESS`(`Retry-After`)                                                                                                            |
| 中断された要求   | 最終更新から**リース時間**を過ぎた `PENDING`/`PROCESSING` は「中断された」とみなして復旧する                                                        |
| 復旧: PENDING    | GitHub をまだ呼んでいない → 普通に `process`                                                                                                        |
| 復旧: PROCESSING | **GitHub を呼んだかもしれない** → `provisioner.reconcile`(課題08)で、実際に作られたかを確認し、結果を確定する。**自動で再作成はしない**             |

用意済み: `hashSpec`(`domain/request-hash.ts`)、`InFlightConflictError`(`db/request-repository.ts`)、`mapWithConcurrency`(課題03)。

## 4. 実装する機能

`ProvisioningService`(コンストラクタ・`get`/`list`/`process` は課題06)に、次を追加する。

### `submit(input: { spec, idempotencyKey }): Promise<{ request, replayed }>`

1. `requestHash = hashSpec(spec)`
2. `requests.createOrGet({ id: ids.next(), idempotencyKey, requestHash, spec, now })`。`InFlightConflictError` を `AppError('REPOSITORY_REQUEST_IN_PROGRESS')` に変換して投げる
3. **新規(`created`)**: `process` して `{ request: 処理後, replayed: false }`
4. **既存**で `requestHash` が違う → `AppError('IDEMPOTENCY_KEY_REUSED', { requestId })`
5. **既存**で同じ内容 → `{ request: resolveReplay(既存), replayed: true }`
   - `SUCCEEDED` / `FAILED` → そのまま
   - `PENDING` / `PROCESSING` で**リース内**(`updatedAt` が `now − leaseMs` より新しい)→ `AppError('REQUEST_IN_PROGRESS', { requestId, retryAfterSeconds: 5 })`
   - 上記で**リース切れ** → `recover` して、その結果

### `recover(request): Promise<RepositoryRequest>`

- `PENDING` → `process(request)`
- `PROCESSING` → `provisioner.reconcile(spec, { requestId, startedAt: request.startedAt, logger })` の結果で確定(`process` と同じ「結果を保存」の処理を再利用)。プロビジョナーが例外を投げたら `INTERNAL_ERROR` の失敗として確定
- それ以外(終端状態)→ そのまま返す
- **別の処理が先に確定させた**(`transition` が `null`)場合は、`findById` で最新を返す(2か所が同時に復旧しても、結果は1つに収束する)

### `recoverStale(concurrency = 3): Promise<{ checked: number; outcomes: { id: string; status: string }[] }>`

`now − leaseMs` より古い `PENDING`/`PROCESSING` を `findStale` で探し、`mapWithConcurrency` で `concurrency` 件ずつ `recover`。
**1件の復旧が失敗しても、他を止めない**: 失敗した要求は `{ id, status: 'ERROR' }` として記録し、ログ(`logger.error`)に残す。`outcomes` には各要求の `{ id, status }` を入れる。

### 結果の保存に失敗したとき

`SUCCEEDED`/`FAILED` の保存(`transition`)が例外になったら、その例外を**そのまま投げる**(要求は `PROCESSING` のまま残り、リース後に復旧される)。
このとき、**GitHub上に作られたリポジトリの名前をログに残す**(復旧・調査の手がかり。`logger.error({ err, githubRepository })`)。

## 5. 実装対象ファイル

`starter/src/services/provisioning-service.ts`(`submit` `recover` `recoverStale` と、必要な private メソッド)

## 6. 受け入れ条件

- [ ] 新規: 処理されて `SUCCEEDED`(GitHub が1回だけ呼ばれる)。GitHub の失敗は `FAILED` として保存され、`submit` は例外にならない
- [ ] 同じキー・同じ内容の再送: **GitHub を呼ばず**、前回と同じ結果(`replayed: true`)。topics の**並び順だけが違う**再送も同じ内容
- [ ] 同じキーで内容が違う → `IDEMPOTENCY_KEY_REUSED`
- [ ] `FAILED` の再送は再実行されず、同じ失敗。新しいキーなら、同じリポジトリで再挑戦できる
- [ ] **同じキーの同時リクエスト**: GitHub は1回だけ。もう片方は `REQUEST_IN_PROGRESS`
- [ ] **別のキーで同じリポジトリを同時に**: 片方が `REPOSITORY_REQUEST_IN_PROGRESS`
- [ ] **GitHubでは作成できたが、結果のDB保存に失敗**: 要求は `PROCESSING` のまま。リース内の再送は `REQUEST_IN_PROGRESS`。**リース切れ後の再送で `SUCCEEDED` になり、リポジトリは重複して作られない**。ログに GitHub 側のリポジトリ名が残る
- [ ] `FAILED` の保存の失敗でも、`PROCESSING` のまま残り例外が伝わる
- [ ] 最初の保存(`createOrGet`)の失敗は例外で、GitHub は呼ばれない
- [ ] `recoverStale`: リース内の要求には触れない / `PENDING` は通常処理 / `PROCESSING` で GitHub に作成済みなら `SUCCEEDED`、無ければ `FAILED(INTERRUPTED)`(**自動で再作成しない**)/ 1件の失敗で他を止めない
- [ ] 同じ要求を2か所が同時に `recover` しても、結果は1つに収束する

## 7. テスト方法

```bash
npm run exercise -- 10     # ex10-idempotency(障害注入つき)
# 全部通ったら、自分の starter を起動して確かめる(課題06〜09も実装済みであること)
cp .env.example .env
npx tsx starter/src/main.ts          # 別のターミナルで curl(docs/development-environment.md)。同じ Idempotency-Key で2回送る
```

テストの `FaultyRepository`(`test-support/faulty-repository.ts`)は、指定した操作を1回だけ失敗させる。**障害をテストで再現する**書き方の見本。

## 8. 段階的なヒント

<details><summary>ヒント1: 全体の骨格</summary>

`submit` は「保存(createOrGet)→ 分岐」の短い関数にし、分岐の中身は private メソッド(`resolveReplay` `isStale`)に切り出す。
`isStale(request)` は `Date.parse(request.updatedAt) < clock.now().getTime() - leaseMs`。

</details>

<details><summary>ヒント2: 結果の保存を共通化する</summary>

課題06の `process` の後半(「結果を保存」)を `finalize(processing, outcome)` に切り出すと、`recover`(PROCESSING)が `reconcile` の結果をそのまま `finalize` に渡せる。
`finalize` の中で `transition(...)` が `null` を返したら `findById` で最新を返す(2か所が同時に確定させたとき、負けた方がここに来る)。

</details>

<details><summary>ヒント3: recoverStale と障害の扱い</summary>

```ts
const stale = await requests.findStale(['PENDING', 'PROCESSING'], cutoffIso);
const outcomes = await mapWithConcurrency(stale, concurrency, async (r) => {
  try {
    const recovered = await this.recover(r);
    return { id: r.id, status: recovered.status };
  } catch (error) {
    logger.error({ requestId: r.id, err: error }, '復旧に失敗');
    return { id: r.id, status: 'ERROR' };
  }
});
```

`mapWithConcurrency` は1つでも失敗すると全体が失敗するので、**各要素の中で try/catch** して、失敗を値として返す。

</details>

## 9. 発展課題

1. `POST /v1/repository-requests/{id}/retry`(FAILED の要求を、新しい試行として再実行する)を設計する。状態遷移・冪等性・履歴(`attempts`)はどうなる?
2. 起動時だけでなく、**定期的に** `recoverStale` を動かす(`setInterval` の後始末とエラー処理に注意)
3. このサービスを**複数プロセス**で動かすとき、何が問題になるか(SQLite・リース・復旧の競合)。解決案を2つ
4. `request_hash` の正規化(owner の大文字小文字など)を変えると、どんな互換性の問題が出る?

## 10. 完了後に理解しておくべきこと

- **冪等性は「HTTPの再送が安全」だけではない**。外部API・DB・状態更新を通した、全失敗点の設計
- 確認してから更新(check-then-act)は競合する。**UNIQUE 制約と compare-and-set** で原子的にする
- 外部システムを含む処理は、**exactly-once にはできない**。「少なくとも1回実行 + 結果の突き合わせ(reconcile)」で、実質的に重複を防ぐ
- 「分からない」状態を明示的に持つ(`PROCESSING` + リース)と、復旧できる
- 障害は**テストで再現**する(障害注入)。再現できない設計は、直せているか分からない
