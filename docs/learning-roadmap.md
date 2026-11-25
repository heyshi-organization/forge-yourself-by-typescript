# 12週間 学習ロードマップ

**想定**: 平日1日 約1時間 × 5日 = 週5時間。忙しい週は「**最低ライン**」(各週の✅マーク)だけで次へ進めるように、課題を小さく分けてあります。
遅れても大丈夫です。**週ではなく「受け入れ条件を満たしたか」**で進んでください。

## 進め方(毎週の流れ)

```
月: 目標を確認 → 課題文(docs/exercises/NN-*.md)の「背景知識」「機能」を読む
火〜木: ヒントを見ずに実装 → npm run exercise -- NN で確認 →(詰まったら)ヒント1 → 2 → 3 の順に
金: 受け入れ条件を満たす → 「理解度の確認」に答える(声に出す/書く)→ コミット・PR・CIの結果を見る
```

1. **まず自分で設計・実装する**(15〜20分考えてから、ヒントを見る)
2. 詰まったら `ヒント1 → 2 → 3` の順に。**`reference/` を見るのは最後の手段**(見たら、見た箇所を閉じて自分で書き直す)
3. AI を使うなら: 「**自分の案**を貼って、レビューしてもらう」「エラーの原因を一緒に調べる」「設計の選択肢を比較してもらう」。「全部書いて」は頼まない
4. 毎週、PR を作って CI の結果を確認する([ci-cd.md](ci-cd.md#4-学習者のワークフローprを作ってciを見る))

## 全体像

| Phase                            | 週  | 課題                                                                             | 主題                                                          |
| -------------------------------- | --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **1. TypeScriptの型システム**    | 1   | [01 型](exercises/01-typescript-types.md)                                        | type/interface・Union・Narrowing・型推論                      |
|                                  | 2   | [02 ジェネリクス](exercises/02-generics.md)                                      | Generics・Utility Types・Result                               |
| **2. JS / Node.js / 非同期**     | 3   | [03 非同期](exercises/03-async-await.md)                                         | Promise・async/await・イベントループ・タイムアウト・リトライ  |
|                                  | 4   | [04 入力値検証](exercises/04-validation.md)                                      | Zod・型と実行時検証・モジュール・設定                         |
| **3. 設計・テスト・品質**        | 5   | [05 API設計](exercises/05-api-design.md)                                         | Fastify・責務分離・エラー形式・モジュール設計                 |
|                                  | 6   | [06 DI](exercises/06-dependency-injection.md)                                    | SOLID・DI・インメモリ実装・サービス層                         |
|                                  | 7   | [07 テスト](exercises/07-testing.md)                                             | Unit/Integration・Mock/Stub・Property-based・ミューテーション |
|                                  | 8   | [08 エラー処理](exercises/08-error-handling.md)                                  | エラー分類・タイムアウト・リトライ・ログの秘匿                |
| **4. 実践・セキュリティ・CI/CD** | 9   | [09 データベース](exercises/09-database.md)                                      | SQLite・SQL・トランザクション・制約・マイグレーション         |
|                                  | 10  | [10 冪等性と復旧](exercises/10-idempotency.md)                                   | 冪等性・障害からの復旧・GitHub連携の結合                      |
|                                  | 11  | [11 セキュリティ](exercises/11-security.md)                                      | 脆弱性・CodeQL・SCA・Secret Scanning                          |
|                                  | 12  | [12 CI/CD](exercises/12-ci-cd.md) + [13 最終課題](exercises/13-final-project.md) | GitHub Actions・コードレビュー・品質改善                      |

> **指示書の例との違い**: 一般的な順序は「Phase 3 = 設計・テスト、Phase 4 = API実装・GitHub連携・SQLite」ですが、
> 実際の**依存関係**に合わせて、API の基本構造(05)を Phase 3 に、冪等性と GitHub 連携の結合(10)を Phase 4 に置きました。
> 05(API)は、06(DI)で組み立てるサービスの入口で、07(テスト)の題材でもあるためです。

### 課題どうしの依存(順番に進める理由)

```
01 型 ──▶ 02 Generics ──▶ 03 非同期 ──▶ 04 検証 ──▶ 05 API ──▶ 06 DI ──▶ 07 テスト(03のretryを題材)
                                                                  │
                                      08 エラー処理(03を使う) ◀──┘      09 DB ──▶ 10 冪等性・復旧 ──▶ 11 セキュリティ ──▶ 12 CI/CD ──▶ 13 最終
```

starter は「前の課題を実装済み」であることを前提にしています(後ろの課題ほど、前の課題の関数を使います)。**飛ばすとエラーになる**ので、順番に。
どうしても飛ばしたい課題は、その課題の starter ファイルだけ reference の該当ファイルをコピーしてください(その課題の学習は諦めることになります)。

---

## Week 1 — TypeScriptの型システム(1) [課題01]

- **学習目標**: 状態ごとに持つフィールドが違うデータを、**型で正しく表現**し、`if` で絞り込めるようになる。「ありえない状態」を型で作れなくする感覚をつかむ
- **学ぶ技術**: `type` / `interface`、リテラル型、Union型(`A | B`)、判別可能Union、Type Narrowing、`readonly`、型推論、`as const`、`never` と網羅性チェック
- **実装する機能**: `domain/request.ts`(ドメインモデルの型)、`domain/state-machine.ts`(状態遷移)、`resource.ts` の網羅性チェックの`as never`を外す
- **作業順序(平日1時間 × 5)**
  1. 課題文の「背景知識」を読み、`type` と `interface` の違い・Union型を自分の言葉でまとめる
  2. `RequestStatus` / `Visibility` / `OwnerType` / `RepositorySpec` を定義
  3. `RepositoryRequest`(判別可能Union)を定義 ✅最低ライン
  4. `ALLOWED_TRANSITIONS` / `canTransition` / `isTerminal` / `assertTransition` / `assertNever`
  5. `resource.ts` の `as never` を外してもコンパイルが通ることを確認。理解度確認
- **完了条件**: `npm run exercise -- 01` が全て✅、`npm run typecheck` が通る
- **理解度の確認**: ① `interface` と `type` はどう使い分ける? ② `status` で絞り込むと `repository` が使えるのはなぜ? ③ `assertNever` は何を守る? ④ `RepositoryRequest` を単一の `interface`(全フィールド optional)にすると何が困る?
- **発展課題**: `Extract<RepositoryRequest, { status: 'FAILED' }>` で型を取り出す / `RepositorySpec` から `Partial`/`Pick` で更新用の型を作る / ブランド型 `type RequestId = string & { __brand: 'RequestId' }`

## Week 2 — TypeScriptの型システム(2) [課題02]

- **学習目標**: **ジェネリクス**で、中身の型に関わらず使える型・関数を書き、型推論が働く様子を観察する
- **学ぶ技術**: ジェネリクス(`<T, E>`)、型引数の推論、制約(`extends`)、Utility Types(`Partial` `Pick` `Omit` `Record` `Extract` `ReturnType` `Awaited`)、`never` の役割、Result 型
- **実装する機能**: `shared/result.ts`(`Result<T,E>`・`ok`/`err`/`map`/`mapErr`/`flatMap`/`unwrapOr`/`collect`/`fromPromise`)、`shared/page.ts`(`Page<T>`・`mapPage`・`sliceToPage`)
- **作業順序**
  1. 例外と `Result` の違い(失敗が型に現れる)を読む
  2. `Result` 型・`ok`・`err` ✅最低ライン
  3. `map` / `mapErr` / `flatMap` / `unwrapOr`
  4. `collect` / `fromPromise`
  5. `Page<T>` と `mapPage`・`sliceToPage`。型テスト(`ex02-generics.test-d.ts`)の意味を読む
- **完了条件**: `npm run exercise -- 02` が全て✅
- **理解度の確認**: ① `ok(1)` の型が `Result<number, never>` になるのはなぜ? ② `flatMap` のエラー型が `E | F` になる理由は? ③ `any` や `as` を使わずに書けた? ④ `Promise<T>` もジェネリクスなのはなぜ?
- **発展課題**: `tryCatch<T>(fn: () => T): Result<T, unknown>` / `Result` を `async` で連鎖する `pipe` / 制約つきジェネリクス `<T extends { id: string }>` で `indexById`

## Week 3 — 非同期処理 [課題03]

- **学習目標**: Promise・`async/await`・イベントループを理解し、**タイムアウト・リトライ・並行数の制御**を自分で書く(外部API連携の土台)
- **学ぶ技術**: Promise、`async/await`、`Promise.race` / `all`、イベントループ(マイクロタスク・タイマー)、`AbortController`、エラー伝播、`try/finally`
- **実装する機能**: `async/timeout.ts`(`withTimeout`)、`async/retry.ts`(`computeBackoffMs`・`retry`)、`async/concurrency.ts`(`mapWithConcurrency`)
- **作業順序**
  1. イベントループと `await` の動きを、`console.log` の順序で予想 → 実行して確かめる
  2. `withTimeout` ✅最低ライン(タイマーの後始末と `abort` を忘れない)
  3. `computeBackoffMs`(指数バックオフ + Full Jitter)
  4. `retry`(再試行する/しない・使い切る・待ち時間のヒント)
  5. `mapWithConcurrency`。理解度確認
- **完了条件**: `npm run exercise -- 03` が全て✅(Property-based テスト含む)
- **理解度の確認**: ① `await` の最中に他の処理が動けるのはなぜ? ② タイマーを `clearTimeout` しないと何が起きる? ③ なぜ Full Jitter? ④ 再試行してはいけないエラーの例は? ⑤ `Promise.all` で1つ失敗したら残りはどうなる?
- **発展課題**: `AbortSignal.any` で複数の中断を合成 / 並行数つきの `Promise.allSettled` / `retry` に総時間の上限(deadline)を追加

## Week 4 — 入力値検証と設定 [課題04]

- **学習目標**: **「型」は実行時には消える**ことを理解し、Zod で「型と実行時検証を同じ定義から」得る。環境変数を安全に読む
- **学ぶ技術**: Zod(`string` `number` `enum` `object` `strict` `refine` `default` `coerce` `safeParse` `superRefine`)、`z.infer`、Node.js のモジュール(ESM)、環境変数
- **実装する機能**: `schemas/repository.ts`(名前・Owner・topics・リクエストボディ・Idempotency-Key・一覧クエリ)、`schemas/config.ts`(環境変数 → `AppConfig`)
- **作業順序**
  1. `as` による型アサーションが「検証ではない」ことを、実際に確かめる(課題文の実験)
  2. `repositoryNameSchema`・`ownerSchema`・`topicSchema` ✅最低ライン
  3. `createRepositoryBodySchema`(`strict`・`default`)と `z.infer` で `CreateRepositoryBody` を導出、`toRepositorySpec`
  4. `idempotencyKeySchema`・`listQuerySchema`(文字列→数値の `coerce`)
  5. `parseConfig`(秘密を含めないエラー・ループバック以外へのバインド拒否)
- **完了条件**: `npm run exercise -- 04` が全て✅(型テスト含む)
- **理解度の確認**: ① `z.infer` を使うと何が嬉しい? ② `strict()` が無いと何が起きる(Mass Assignment)? ③ なぜ入力値をエラーメッセージに含めない? ④ `HOST=0.0.0.0` を拒否する理由は?
- **発展課題**: `.transform()` で正規化(owner を小文字に) / `z.discriminatedUnion` / Zod のエラーを RFC 9457(Problem Details)形式に

## Week 5 — API設計 [課題05]

- **学習目標**: HTTP API の**責務分離**(受け取る・検証する・サービスを呼ぶ・返す)と、利用者に優しく安全な**エラー形式**を設計する
- **学ぶ技術**: Fastify(ルート・フック・エラーハンドラ・`inject`)、HTTPステータス、REST の基本、相関ID、モジュール設計(依存の向き)
- **実装する機能**: `http/errors.ts`(`sendError`/`handleError`/`parseWith`)、`http/app.ts`(`buildApp`: 5つのルート)
- **作業順序**
  1. API を**先に紙に設計**(エンドポイント・ステータス・エラー形式。[api-specification.md](api-specification.md) を見る前に)
  2. `sendError` と `handleError` ✅最低ライン(エラー形式の統一が肝)
  3. `buildApp` に `healthz` と 404、レスポンスヘッダ
  4. `POST /v1/repository-requests`(ヘッダ・ボディ検証 → サービス呼び出し → 201/200/エラー)
  5. `GET` 一覧・詳細
- **完了条件**: `npm run exercise -- 05` が全て✅(サービスはスタブで検証される)
- **理解度の確認**: ① ハンドラにビジネスロジックを書かない理由は? ② 認証エラーを 502 にしたのはなぜ(401/403 でない)? ③ 想定外の例外の詳細を返さない理由? ④ `X-Correlation-Id` を検証してから使う理由は?
- **発展課題**: `Retry-After` をレート制限の失敗に付ける / ETag・条件付きリクエスト / OpenAPI を見ながら `curl` で全エンドポイントを手動確認

## Week 6 — 依存性の注入(DI)とサービス層 [課題06]

- **学習目標**: **SOLID**(特に単一責任・依存性逆転)を、「差し替えられる設計」として体験する
- **学ぶ技術**: SOLID、インターフェース(ポート)、コンストラクタ注入、Composition Root、インメモリ実装、Fake/Stub
- **実装する機能**: `db/in-memory-request-repository.ts`、`services/provisioning-service.ts`(`get`/`list`/`process`)、`composition.ts`(`buildContainer`)
- **作業順序**
  1. `RequestRepository` / `RepositoryProvisioner` のインターフェースを読み、依存の向きを図にする
  2. `InMemoryRequestRepository`(**契約テスト**が通るまで)✅最低ライン
  3. `ProvisioningService.get` / `list` / `process`(compare-and-set の `transition`)
  4. `buildContainer`(`overrides` で差し替え可能に)
  5. 「`new SqliteRequestRepository` が書かれているのは1か所だけ」を `grep` で確認
- **完了条件**: `npm run exercise -- 06` が全て✅
- **理解度の確認**: ① DI で何が変わった(DIなしだとテストはどう書く)? ② インターフェースを置く場所はなぜ「使う側」の近く? ③ `Clock` や `IdGenerator` を注入する理由は? ④ DIコンテナを使わない判断のトレードオフは?
- **発展課題**: `ProvisioningService` を Single Responsibility の観点でレビュー(分けるなら?)/ `RequestRepository` にイベントフック(Observer)を追加する設計案を書く / 循環依存を `madge` で検出

## Week 7 — テスト [課題07]

- **学習目標**: **バグを見つけられるテスト**を設計する。Mock/Stub/Fake の使い分け、Property-based Testing
- **学ぶ技術**: Vitest(`describe/it/expect/vi.fn`)、AAA(Arrange/Act/Assert)、境界値、Property-based(fast-check)、ミューテーションテスト、カバレッジの限界
- **実装する機能**: `starter/test/ex07-retry.test.ts` — `retry` と `computeBackoffMs` のテストを**自分で**書く
- **作業順序**
  1. `ex07-retry.test.ts` の `it.todo` を読み、観点(正常・異常・境界・性質)を自分で追加で洗い出す
  2. 正常系・再試行系・上限のテスト ✅最低ライン
  3. エラーの種類(再試行不可・待ち時間のヒント)のテスト
  4. Property-based テストを1つ書く
  5. `npm run exercise -- 07` でミューテーション検査 → **見逃したバグ**のヒントを読んでテストを足す
- **完了条件**: 10個のバグをすべて検出できる(`10/10`)
- **理解度の確認**: ① カバレッジ100%でもバグを見逃せるのはなぜ? ② `vi.fn()` で「呼ばれ方」を検証するのと、結果を検証するのと、どちらを優先する? ③ テストが実装の内部に依存しすぎると何が困る? ④ Property-based で「性質」を見つけるコツは?
- **発展課題**: `withTimeout` / `mapWithConcurrency` にもミュータントを自分で考える / `vi.useFakeTimers()` でタイマーを制御 / スナップショットテストの是非

## Week 8 — エラーハンドリング・タイムアウト・リトライ [課題08]

- **学習目標**: GitHub の失敗を**分類**し、再試行してよいものだけを再試行する。**結果が分からない失敗**でも重複作成しない。ログに秘密を出さない
- **学ぶ技術**: エラー設計(カスタムError・`cause`)、HTTPエラーの分類、Retry-After / レート制限ヘッダ、`Result` の活用、正規表現、再帰的なデータ変換
- **実装する機能**: `github/classify.ts`(分類・再試行可否・エラーコード)、`provisioning/resilient-provisioner.ts`、`logging/redact.ts`
- **作業順序**
  1. 分類表(課題文)を読み、`classifyGitHubError` を実装 ✅最低ライン
  2. `isRetryableGitHubError` / `toErrorCode`(`switch` の網羅性)
  3. `redactString` / `redactSecrets`
  4. `ResilientProvisioner.provision`(認証確認→作成→topics)
  5. 「結果が分からない失敗」の扱い(`ambiguous` → 作成日時で判定)と `reconcile`
- **完了条件**: `npm run exercise -- 08` が全て✅
- **理解度の確認**: ① タイムアウト後の再試行で `conflict` が返ったら、なぜ即「重複」と断定しない? ② 認証エラーを再試行しない理由は? ③ 利用者に返すエラーと、ログに残すエラーが違う理由は? ④ ログのマスクで防げないものは?
- **発展課題**: サーキットブレーカー(連続失敗したら一定時間呼ばない)/ レート制限の残量(`x-ratelimit-remaining`)を見て事前に抑制 / 失敗の統計を構造化ログから集計

## Week 9 — データベース(SQLite) [課題09]

- **学習目標**: SQL とトランザクション・制約を使って、**アプリのバグがあっても壊れないデータ**を設計する
- **学ぶ技術**: SQL(DDL/DML)、SQLite(STRICT・CHECK・UNIQUE・部分インデックス・WAL)、better-sqlite3、トランザクション、マイグレーション、行 → ドメインの変換
- **実装する機能**: `db/migrations.ts`(スキーマ + `migrate`)、`db/sqlite-request-repository.ts`
- **作業順序**
  1. [database-design.md](database-design.md) を読まずに、テーブルを自分で設計 → 比較する
  2. マイグレーション(`CREATE TABLE`・制約・インデックス)と `migrate` ✅最低ライン
  3. `createOrGet`(トランザクション)・`findById`
  4. `transition`(compare-and-set)・`list`・`findStale`
  5. 制約テスト(`ex09-sqlite-constraints`)と SQL インジェクション耐性
- **完了条件**: `npm run exercise -- 09` が全て✅(契約テストはインメモリ版と同じもの)
- **理解度の確認**: ① `UPDATE ... WHERE status = ?` がなぜ二重実行を防ぐ? ② CHECK 制約がある意味(アプリで検証済みなのに)? ③ 部分ユニークインデックスは何を守る? ④ バインド変数と文字列連結の違いは?
- **発展課題**: `attempts` テーブル(試行履歴)を追加するマイグレーション / `EXPLAIN QUERY PLAN` でインデックスが使われているか確認 / キーセットページネーション

## Week 10 — 冪等性と障害からの復旧 [課題10]

- **学習目標**: 外部APIを含む処理で、**どの時点で落ちても**二重作成・状態の不整合が起きない設計と実装
- **学ぶ技術**: 冪等性、Idempotency-Key、状態機械、compare-and-set、reconcile(突き合わせ)、リース、障害注入(`FaultyRepository`)
- **実装する機能**: `ProvisioningService.submit` / `recover` / `recoverStale`
- **作業順序**
  1. [ADR-0007](adr/0007-idempotency.md)の図を**見ずに**、失敗点を時系列に書き出し、各点での対処を設計
  2. `submit`(新規 / 同じキー同じ内容 / 同じキーで内容違い)✅最低ライン
  3. 処理中の再送(409)と同時リクエスト
  4. `recover`(PENDING / PROCESSING の reconcile)
  5. `recoverStale`(並行数つき)と、DB保存失敗の再現テスト。ここまでで `starter` が**動くアプリ**になる → `npx tsx starter/src/main.ts`
- **完了条件**: `npm run exercise -- 10` が全て✅。自分の starter を起動し、curl で再送しても二重に作られないことを確認
- **理解度の確認**: ① `FAILED` を再送で再実行しない理由は? ② リースを短くしすぎると何が起きる? ③ 「GitHubでは作成できたがDB保存に失敗」したとき、どう復旧する? ④ 同時に2つ届いたとき、誰が勝つ?
- **発展課題**: `POST /v1/repository-requests/{id}/retry`(FAILED の再実行)の設計 / 定期的に `recoverStale` を動かすタイマー / 複数プロセスで動かすときの問題点

## Week 11 — セキュリティ [課題11]

- **学習目標**: 代表的な脆弱性を**自分で悪用して**理解し、修正し、CodeQL などのツールが**何を検出し何を検出できないか**を知る
- **学ぶ技術**: SQLi・コマンドインジェクション・パストラバーサル・入力検証不備・秘密のハードコード・情報漏洩・認可の欠如・SSRF、CodeQL、SCA、Secret Scanning
- **実装する機能**: `security-labs/` の演習(8テーマ)。修正して、テストを通す
- **作業順序**(8テーマを2〜3週に分けてもよい。最低ライン: 01・04・07)
  1. [security-labs/README.md](../security-labs/README.md) を読み、`npm run lab:start -- 01` で展開(ブランチが切られる)
  2. 脆弱なコードを読み、**攻撃してみる**(テストが失敗する)→ 修正する
  3. ドラフトPRを作り、**CodeQL が検出するか**を確認(検出される/されない)
  4. 残りの演習(`npm run exercise -- 11` で状況確認)
  5. 自分の `starter/` に `npm audit` を実行し、結果の読み方を確認。[security-design.md](security-design.md) を読む
- **完了条件**: 取り組んだ演習のテストがすべて通る。各演習で「CodeQLが検出した/しなかった理由」を説明できる
- **理解度の確認**: ① なぜバインド変数で SQLi を防げる? ② 許可リストと拒否リストの違いは? ③ CodeQL が検出できない脆弱性の例と、その理由は? ④ 秘密を push してしまったら、最初に何をする?
- **発展課題**: 自分で新しい脆弱な例を作り、CodeQL の挙動を調べる / `npm audit` の指摘を再現 / ReDoS の演習を追加

## Week 12 — CI/CD と総仕上げ [課題12・13]

- **学習目標**: 自分の手で CI を設計し、**品質ゲート**を組む。作ったものを**レビュー**し、設計意図とトレードオフを説明する
- **学ぶ技術**: GitHub Actions(トリガー・権限・SHA固定・キャッシュ)、品質ゲート設計、コードレビュー、リファクタリング、ライブテスト
- **実装する機能**: `starter/ci/ci.yml`(自分のワークフロー)、最終課題(レビュー・品質改善・ライブテスト)
- **作業順序**
  1. 課題12: `starter/ci/ci.yml` を、最小権限・SHA固定で書く(`npm run exercise -- 12` で検査)✅最低ライン
  2. 自分のリポジトリ(fork/コピー)に `.github/workflows/` として置き、PRで実行 → 失敗させて、ゲートが効くことを確認
  3. 課題13: `npm run verify` を全部通す。自分の starter と reference を**読み比べ**、違いと理由を書く
  4. コードレビュー(セルフ)。[課題13のチェックリスト](exercises/13-final-project.md)
  5. ふりかえり: 設計の説明(下の「最終確認」)を、声に出して・文章で
- **完了条件**: `npm run exercise` が全て✅。CI がグリーン。設計の説明ができる
- **理解度の確認**: ① `permissions` を最小にする理由は? ② Action をタグでなく SHA で固定する理由は? ③ `pull_request_target` が危険な理由は? ④ このサービスを本番で公開するなら、何が足りない?
- **発展課題**: [advanced-topics.md](advanced-topics.md)

---

## 最終確認(全課題の後)

次の問いに、**何も見ずに**答えられれば、このプロジェクトの目的は達成です。

1. このシステムの構成(層)と、依存の向きは? なぜそうした?
2. 同じリクエストを2回送ったら、何が起きる? プロセスが途中で落ちたら?
3. GitHub がタイムアウトしたとき、なぜ単純に再試行してはいけない場合がある?
4. 型はいつ消える? だから入力検証はどうする?
5. このテストが「バグを見つけられる」とどうやって確かめる?
6. 秘密情報を守るために、どこで何をしている(コード・ログ・CI・リポジトリ設定)?
7. CodeQL は何を見つけて、何を見つけない?
8. 本番に出す前に足りないものは?(認証・監視・バックアップ・スケール…)
