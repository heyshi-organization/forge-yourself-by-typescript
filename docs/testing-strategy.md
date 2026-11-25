# テスト戦略

判断の理由は [ADR-0011](adr/0011-testing-strategy.md)。**テストはこのプロジェクトの重要な要件**です。

## 1. テストの種類と置き場所

| 種類                         | 場所                                                       | 実行                                                                    | 何を確認するか                                                                   |
| ---------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **受け入れテスト**(課題ごと) | `exercises/tests/exNN-*.test.ts`(`*.test-d.ts` は型テスト) | `npm run exercise -- NN`(自分の実装)/ `npm run exercise:verify`(完成形) | 課題の受け入れ条件。ユニット・契約・Property-based を含む                        |
| 結合テスト                   | `reference/test/http/` ほか                                | `npm test`                                                              | Fastify + SQLite + Fake GitHub を組み合わせた API、OpenAPI、Octokit クライアント |
| 学習者のテスト               | `starter/test/`                                            | `npm run test:starter` / `npm run exercise -- 07`                       | 課題07で自分で書くテスト                                                         |
| 演習のテスト                 | `security-labs/*/security.test.ts.txt`                     | `npm run lab:test -- <ID>`                                              | 脆弱性を直せたか(課題11)                                                         |
| ライブテスト(実GitHub)       | `reference/test-live/`                                     | `npm run test:live`(**任意・明示的**)                                   | 実際の GitHub API との結合                                                       |
| ツールのテスト               | `scripts/test/`                                            | `npm test`                                                              | ワークフロー検査・秘密スキャナ                                                   |

### ユニットテスト(外部サービスに依存しない)

入力値検証 / 状態遷移 / 冪等性 / エラー分類 / リトライ判定 / バックオフ / ビジネスロジック(サービス) / ログのマスク。

### 結合テスト

- Fastify の HTTP API(`app.inject()` — ポートを開かずにリクエストを送る)
- SQLite への保存・取得・**トランザクション・制約**(`:memory:` と一時ファイル)
- API + DB + Fake GitHub を組み合わせた処理(`createTestEnv()`)

### 外部API(GitHub)の扱い — 2層に分けてテストする

| 層                                         | テスト対象                                                        | GitHub側の用意                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ビジネスロジック(サービス・プロビジョナー) | 失敗の仕方に対する**振る舞い**(リトライする?諦める?重複させない?) | `FakeGitHubClient`(`enqueue('createRepository', { type: 'fail', error })` で失敗を差し込む) |
| `OctokitGitHubClient`                      | **HTTPの形**(URL・ボディ・ヘッダ・ステータスの分類)               | Octokit の `fetch` を差し替え(ネットワークなし)                                             |

## 2. 異常系のチェックリスト(要件8.4)

| ケース                       | どこでテストしているか                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| 正常系                       | `api.test.ts`、`ex10-idempotency.test.ts`                                                        |
| 不正な入力                   | `ex04-schemas.test.ts`、`ex05-api.test.ts`                                                       |
| GitHub 認証エラー / 権限不足 | `ex08-classify.test.ts`、`ex08-provisioner.test.ts`、`api.test.ts`                               |
| Rate Limit                   | 同上(`Retry-After` あり/なし、待ち時間が長すぎる場合)                                            |
| タイムアウト                 | `ex03-timeout-concurrency.test.ts`、`ex08-provisioner.test.ts`(`hang` で応答しない相手を再現)    |
| 一時的な障害                 | `ex08-provisioner.test.ts`(503 → 回復 / 回数超過)                                                |
| DB 保存失敗                  | `ex10-idempotency.test.ts`(`FaultyRepository`)、`ex09-sqlite-constraints.test.ts`、`api.test.ts` |
| リクエスト重複               | `ex10-idempotency.test.ts`、`api.test.ts`                                                        |
| リトライ回数超過             | `ex03-retry.test.ts`、`ex08-provisioner.test.ts`                                                 |

## 3. Property-based Testing

「どんな入力でも成り立つ性質」を書き、fast-check が数百〜の入力を自動生成して検証する。

| 性質                                                             | ファイル                     |
| ---------------------------------------------------------------- | ---------------------------- |
| どんな遷移列でも、終端状態から先へは進めない                     | `ex01-state-machine.test.ts` |
| バックオフは常に `0 ≤ 待ち時間 ≤ min(上限, base×2^(n-1))` の整数 | `ex03-retry.test.ts`         |
| リトライの実行回数は maxAttempts を超えない                      | 同上                         |
| 検証を通った名前に、パス区切り・空白・`..` は含まれない          | `ex04-schemas.test.ts`       |
| トークンは、どんな位置・形に埋め込まれても出力に残らない         | `ex08-redact.test.ts`        |

## 4. 契約テスト(Fake と本物が食い違わないこと)

`test-support/repository-contract.ts` の**同じテスト**を、`InMemoryRequestRepository`(課題06)と `SqliteRequestRepository`(課題09)の両方に実行する。

## 5. テストの品質: ミューテーション検査(課題07)

カバレッジが高くても、**バグを見つけられるとは限らない**(実行されただけで、結果を確認していないテストでも行は通る)。
`scripts/check-mutants.mjs` は、`retry` に10種類のバグ(試行回数の±1、バックオフの上限なし、再試行不可のエラーを再試行 等)を仕込み、
**あなたのテストがすべて検出できるか**で判定する。完成形のテスト(`ex03-retry.test.ts`)は10/10を検出する(CIで毎回確認)。

カバレッジは下限(行90%・分岐85%、`vitest.config.ts`)を守るために計測するが、**数字を追うことは目的ではない**。

## 6. 実行コマンド

```bash
npm test                      # 全テスト(reference + 受け入れテスト(完成形)+ scripts)。ネットワーク・認証情報は不要
npm run test:coverage         # カバレッジつき(閾値あり)。HTMLは coverage/lcov-report/
npm run exercise              # 課題の進捗一覧(自分の starter を検査)
npm run exercise -- 03        # 課題03だけ詳細に
npm run exercise:verify       # 受け入れテストを完成形で実行(教材の自己検証。CIで実行)
```

## 7. ライブテスト(実GitHub APIを使う)— 任意・明示的

**通常のテストでは、実際のリポジトリを作らない。** ライブテストは次の**すべて**が揃わない限り、全件スキップされ何も作成しない。

| 環境変数                                       | 内容                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `RUN_LIVE_GITHUB_TESTS=1`                      | 実行の意思表示                                                                           |
| `GITHUB_TOKEN`                                 | **テスト専用**の fine-grained PAT。対象を専用Ownerのリポジトリ作成に絞り、有効期限を短く |
| `LIVE_GITHUB_OWNER` / `LIVE_GITHUB_OWNER_TYPE` | リポジトリを作る**テスト専用の Owner**(個人の作業用アカウント/本番Orgは使わない)         |
| `LIVE_GITHUB_CONFIRM`                          | `LIVE_GITHUB_OWNER` と**同じ値**(取り違え防止)                                           |

安全のための設計: 作成するのは**常に private**・名前は `forge-live-test-<時刻>-<乱数>`・終了後に削除を試みる(トークンに削除権限が無ければ手動削除を案内)・CIでは実行しない(CIに秘密を渡さない)。

```bash
RUN_LIVE_GITHUB_TESTS=1 LIVE_GITHUB_OWNER=my-sandbox-org LIVE_GITHUB_OWNER_TYPE=organization \
LIVE_GITHUB_CONFIRM=my-sandbox-org GITHUB_TOKEN=... npm run test:live
```

> ⚠️ このリポジトリの作成時点で、**ライブテストは実行していない(未検証)**。実在のトークンでリポジトリを作成してしまうため、利用者の明示的な承認なしには行わない方針。
> 実行したら、結果を ADR か PR に残すことを推奨する。
