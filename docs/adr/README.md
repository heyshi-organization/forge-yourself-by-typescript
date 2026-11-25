# ADR(Architecture Decision Records)

重要な設計判断と、その理由・代替案を記録したものです。「なぜこうなっているのか」を知りたいときはここを読みます。
自分で設計するとき(課題の「設計してから実装する」場面)は、**先に自分の案を考えてから**読むと学習効果が高くなります。

| #                                            | タイトル                     | 要点                                                                                                        |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [0001](0001-technology-selection.md)         | 技術選定                     | Node 24 / TypeScript 6.0 / Fastify 5 / Zod 4 / Octokit / better-sqlite3 / Vitest。TS 7 を採用しなかった理由 |
| [0002](0002-architecture.md)                 | アーキテクチャ               | レイヤーと依存の向き、ポート(インターフェース)とアダプタ                                                    |
| [0003](0003-dependency-injection.md)         | 依存性の注入                 | DIコンテナを使わず、コンストラクタ注入 + Composition Root                                                   |
| [0004](0004-repository-layout.md)            | リポジトリ構成と教材の作り方 | reference と starter の同期、受け入れテストの共有                                                           |
| [0005](0005-github-authentication.md)        | GitHub API の認証            | 環境変数の fine-grained PAT。GitHub App は将来の選択肢                                                      |
| [0006](0006-synchronous-processing.md)       | 非同期処理の設計             | リクエスト内で同期処理し、状態をDBに残す。キューは使わない                                                  |
| [0007](0007-idempotency.md)                  | 冪等性の実現方法             | Idempotency-Key・状態のcompare-and-set・中断からの復旧                                                      |
| [0008](0008-timeout-and-retry.md)            | タイムアウトとリトライ       | 指数バックオフ + Full Jitter、「結果が分からない失敗」の扱い                                                |
| [0009](0009-error-handling.md)               | エラー処理方針               | エラーカタログ、利用者向けと内部向けの分離                                                                  |
| [0010](0010-sqlite-schema.md)                | SQLite のスキーマ設計        | STRICT・CHECK・部分ユニークインデックス・マイグレーション                                                   |
| [0011](0011-testing-strategy.md)             | テスト戦略                   | Fake・契約テスト・Property-based・ミューテーション検査・ライブテスト分離                                    |
| [0012](0012-logging.md)                      | ログ設計                     | 構造化ログ、秘密情報の出力側マスク                                                                          |
| [0013](0013-security-labs-isolation.md)      | セキュリティ演習の隔離       | `.txt` 保管 + `exercise/*` ブランチ + ガード                                                                |
| [0014](0014-ci-quality-gates.md)             | CI の品質ゲート              | 何で PR を失敗させ、何を参考情報にするか                                                                    |
| [0015](0015-repository-security-settings.md) | リポジトリのセキュリティ設定 | Secret Scanning 等の実調査結果と限界                                                                        |
| [0016](0016-api-scope-and-openapi.md)        | APIの範囲とOpenAPI           | 認証なし(ローカル専用)の判断、Zod から仕様書を生成                                                          |

## 書き方(新しく判断を記録するとき)

```markdown
# ADR-00XX: タイトル

- 状態: 採用 / 却下 / 置き換え(→ADR-00YY)
- 日付: YYYY-MM-DD

## 背景

## 選択肢(メリット・デメリット)

## 決定

## 結果(この決定で得られるもの・受け入れるトレードオフ)
```
