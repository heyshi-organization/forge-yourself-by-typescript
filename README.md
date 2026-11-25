# forge-yourself-by-typescript

**TypeScript でバックエンドを作れるようになるための、12週間の学習プロジェクト。**
題材は、GitHub リポジトリの作成を受け付ける小さなバックエンド `Repository Provisioning Service` です。

> Fastify + Zod + Octokit + SQLite + Vitest / 冪等性・障害からの復旧・タイムアウトとリトライ・セキュリティ(CodeQL・SCA・Secret Scanning)・CI

目的は、完成したコードを手に入れることではありません。**あなた自身**が、要件を理解し、設計し、実装し、テストし、品質を担保できるようになることです。

---

## ⚠️ 最初に: 完成形(`reference/`)は見ない

このリポジトリには**完成形の実装**があります(`reference/`)。しかしそれは**答え合わせ・詰まったときの最後の手段**です。
`docs/` と `starter/` だけで、学習を進められるように作ってあります。

| 場所 | 役割 | 学習中の扱い |
|---|---|---|
| [`docs/`](docs/) | 設計書・ADR・ロードマップ・課題 | **読む**(ここから始める) |
| [`starter/`](starter/) | 未完成のアプリ | **ここにコードを書く** |
| [`exercises/`](exercises/) | 課題の受け入れテスト | 実行して合否を確認(中身は仕様書として読んでよい) |
| [`security-labs/`](security-labs/) | 脆弱性の演習(課題11) | 課題11で使う |
| `reference/` | 完成形 | **最後の手段**。見たら、閉じて自分で書き直す |

## 学習を始める(5分)

```bash
# 1. 自分のコピーを作る(fork するか、このリポジトリを自分のアカウントにコピー)。公開/非公開どちらでもよい
git clone <自分のリポジトリのURL> && cd forge-yourself-by-typescript

# 2. 環境(Node.js 24.19 以上 25 未満)。詳細: docs/development-environment.md
node -v && npm ci

# 3. 全部の検査が通ることを確認(完成形の検査。あなたの starter は未実装なので、最初は進捗が空で正常)
npm run verify

# 4. 進捗を見る → 課題01から始める
npm run exercise
```

**読む順番**

1. [プロジェクト概要](docs/project-overview.md) → [学習ロードマップ](docs/learning-roadmap.md)(12週間の計画)
2. [課題01](docs/exercises/01-typescript-types.md) を読み、`starter/src/domain/` に自分で実装 → `npm run exercise -- 01`
3. 通ったら次の課題へ。詰まったら、課題文の**ヒント1 → 2 → 3**

AI(Claude など)を使うときは、**自分の案を先に書いて**レビューしてもらう/エラーの原因を調べる/選択肢を比較する。「全部書いて」は頼まない。
(Claude Code が使えなくなっても、`docs/` を読めば続けられます)

## 課題(12個 + 最終課題)

| 週 | 課題 | 主題 |
|---|---|---|
| 1 | [01 型](docs/exercises/01-typescript-types.md) | 型・Union・Narrowing |
| 2 | [02 ジェネリクス](docs/exercises/02-generics.md) | Generics・Result |
| 3 | [03 非同期](docs/exercises/03-async-await.md) | Promise・タイムアウト・リトライ |
| 4 | [04 入力値検証](docs/exercises/04-validation.md) | Zod・設定 |
| 5 | [05 API設計](docs/exercises/05-api-design.md) | Fastify・エラー形式 |
| 6 | [06 DI](docs/exercises/06-dependency-injection.md) | 依存性の注入・サービス層 |
| 7 | [07 テスト](docs/exercises/07-testing.md) | ミューテーション検査・Property-based |
| 8 | [08 エラー処理](docs/exercises/08-error-handling.md) | 分類・リトライ・ログの秘匿 |
| 9 | [09 データベース](docs/exercises/09-database.md) | SQLite・トランザクション |
| 10 | [10 冪等性と復旧](docs/exercises/10-idempotency.md) | 冪等性・障害からの復旧 |
| 11 | [11 セキュリティ](docs/exercises/11-security.md) | 脆弱性・CodeQL・SCA |
| 12 | [12 CI/CD](docs/exercises/12-ci-cd.md)・[13 最終](docs/exercises/13-final-project.md) | GitHub Actions・レビュー |

各課題: 目的 / 概念 / 背景知識 / 機能 / 対象ファイル / 受け入れ条件 / テスト方法 / **段階的ヒント** / 発展課題 / 理解すべきこと。

## よく使うコマンド

```bash
npm run exercise                # 課題の進捗一覧
npm run exercise -- 03          # 課題03の受け入れテスト(詳細)
npm run verify                  # CIと同じ検査(コミット前に)
npm run dev                     # 完成形のアプリを起動(GITHUB_CLIENT=fake なら GitHub に接続しない)
npm run lab:start -- 01         # セキュリティ演習の開始(課題11)
```
全コマンド: [docs/development-environment.md](docs/development-environment.md#5-よく使うコマンド)

## 作るもの(Repository Provisioning Service)

```
クライアント ──HTTP──▶ サービス ──HTTPS──▶ GitHub API
                         └──▶ SQLite(要求と結果)
POST /v1/repository-requests   Idempotency-Key 必須。リポジトリ作成を依頼(冪等)
GET  /v1/repository-requests   一覧            GET /v1/repository-requests/{id}  詳細・処理状態
```
- 入力検証・状態管理(PENDING→PROCESSING→SUCCEEDED/FAILED)・冪等性・タイムアウト/リトライ・構造化ログ・エラーの出し分け
- **ローカルの Node.js だけで完結**(Docker・クラウド不要)。**認証はない(ローカル専用)**。既定で `127.0.0.1` のみ
- API仕様: [docs/api-specification.md](docs/api-specification.md) / [OpenAPI](docs/openapi.json)

## ドキュメント

| | |
|---|---|
| 設計 | [アーキテクチャ](docs/architecture.md) · [シーケンス図](docs/sequence-diagrams.md) · [API仕様](docs/api-specification.md) · [DB設計](docs/database-design.md) · [ADR(設計判断)](docs/adr/README.md) |
| 品質 | [テスト戦略](docs/testing-strategy.md) · [CI/CD](docs/ci-cd.md) · [セキュリティ設計](docs/security-design.md) |
| 学習 | [ロードマップ](docs/learning-roadmap.md) · [課題一覧](docs/exercises/README.md) · [用語集](docs/glossary.md) · [発展課題](docs/advanced-topics.md) |
| 運用 | [開発環境](docs/development-environment.md) · [GitHub 側の設定](docs/github-settings.md) · [要件定義](docs/requirements.md) |

## 公開リポジトリとしての注意

このリポジトリは **public** です。**秘密情報・個人情報をコミットしない**(`npm run check:secrets`)。
トークンは環境変数だけで扱い、`.env` はコミットされません。詳細: [セキュリティ設計](docs/security-design.md)。
脆弱性の報告: [SECURITY.md](SECURITY.md)。

## 技術スタック

Node.js 24 · TypeScript 6 · Fastify 5 · Zod 4 · Octokit · better-sqlite3 · Vitest 5 · ESLint 10 · Prettier · GitHub Actions · CodeQL · Dependabot。選定理由: [ADR-0001](docs/adr/0001-technology-selection.md)。
