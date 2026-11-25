# 要件定義

要求の出どころは [`PROJECT_INSTRUCTIONS.md`](../PROJECT_INSTRUCTIONS.md)。ここでは、要件を整理し、**曖昧な点・矛盾とその判断**を記録する。

## 1. 機能要件

| ID  | 要件                                                                                               | 実装                                                        | 課題       |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------- |
| A   | リポジトリ作成(名前・説明・Owner・public/private・README初期化・topics)                            | `POST /v1/repository-requests`                              | 05, 06, 08 |
| B   | 参照(一覧・ID詳細・GitHub URL・処理状態)                                                           | `GET /v1/repository-requests[/{id}]`                        | 05, 09     |
| C   | リクエスト管理(PENDING→PROCESSING→SUCCEEDED/FAILED。不正遷移の防止)                                | `domain/state-machine.ts`                                   | 01, 09     |
| D   | 入力値検証(必須・長さ・名前形式・列挙値・想定外フィールド)                                         | `schemas/` (Zod)                                            | 04         |
| E   | エラーハンドリング(認証・権限・重複・Rate Limit・一時障害・タイムアウト・不正入力・DB失敗・想定外) | `github/classify.ts`, `http/errors.ts`, `errors/catalog.ts` | 08         |
| F   | 構造化ログ(ID・結果・外部API結果・エラー・処理時間。秘密を出さない)                                | `logging/`                                                  | 08         |
| G   | 冪等性(Idempotency-Key。外部API呼び出し途中の障害も考慮)                                           | `services/provisioning-service.ts`                          | 10         |
| H   | タイムアウト・リトライ(指数バックオフ・上限・Rate Limit・再試行不可・重複防止)                     | `async/`, `provisioning/`                                   | 03, 08     |

## 2. 非機能要件

| 分類         | 要件                                                                                                                                           | 確認方法                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 実行環境     | ローカルの Node.js のみ。SQLite はローカルファイル。Docker 等は不要                                                                            | [development-environment.md](development-environment.md) |
| テスト容易性 | GitHub・DB・時計・ID を差し替えられる(DI)。通常テストはネットワーク不要                                                                        | `npm test`                                               |
| 品質         | 型検査・ESLint・Prettier・カバレッジ                                                                                                           | `npm run verify`                                         |
| セキュリティ | 入力検証・SQLi・コマンドインジェクション・パストラバーサル・エラー情報の漏洩防止・秘密の管理・ログ秘匿・タイムアウト・ローカル以外に公開しない | [security-design.md](security-design.md)                 |
| 可観測性     | 構造化ログ、相関ID                                                                                                                             | [ADR-0012](adr/0012-logging.md)                          |
| 保守性       | 責務分離、小さなファイル、過剰な抽象化をしない                                                                                                 | [architecture.md](architecture.md)                       |

## 3. 技術的な制約

- Node.js 24 / TypeScript / Fastify / Zod / Octokit / SQLite / Vitest / ESLint / Prettier([ADR-0001](adr/0001-technology-selection.md))
- マイクロサービス化しない。メッセージキューを導入しない。Backstage への依存を持たない(将来呼び出せる可能性は妨げない)
- 実GitHub APIのテストは通常テストと分離し、明示的なコマンドでのみ実行([testing-strategy.md](testing-strategy.md))
- **公開リポジトリ**: 個人情報・秘密情報をコミットしない

## 4. 学習要件

- 約12週間、平日1日1時間程度(週5時間)。**1課題を1〜2週間**に分割し、各課題はさらに小さな段階(ヒント付き)に分ける
- `starter/` に自分で実装する。完成形と学習用コードは分離する
- 各課題に、目的・概念・背景・機能・対象ファイル・受け入れ条件・テスト方法・ヒント・発展課題・完了後に理解すべきこと
- Claude Code が使えなくなっても、ドキュメントだけで学習を継続できる

## 5. 完了条件

[`PROJECT_INSTRUCTIONS.md` 13章](../PROJECT_INSTRUCTIONS.md) のチェックリストのとおり。達成状況は、リポジトリ作成時の最終報告と `npm run verify` の結果で確認する。

## 6. 指示書の曖昧な点・矛盾と、判断

| #   | 曖昧・矛盾                                                                                         | 判断(理由)                                                                                                                                 | 記録                                                 |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 1   | 「脆弱なコードを専用ディレクトリに隔離」と「main にマージしない」の両立                            | `security-labs/` に `.txt` で保管し、学習者の `exercise/*` ブランチで展開。マージはCIで禁止                                                | [ADR-0013](adr/0013-security-labs-isolation.md)      |
| 2   | 冒頭の文「このリポジトリパブリックリポジトリであるため…以下の対応を行うこと」が途中で途切れている  | 「公開リポジトリなので、個人情報・秘密情報をアップしない」と解釈。コミット前に `npm run check:secrets`                                     | [security-design.md](security-design.md)             |
| 3   | 「学習者が完成形を最初から参照しない」と「同一リポジトリに完成形を置く」                           | `reference/` を別ディレクトリにし、READMEと各課題で注意を明記。学習に必要な情報は `docs/` と `starter/` に集約                             | [ADR-0004](adr/0004-repository-layout.md)            |
| 4   | 12週間に対して、課題が12個+最終課題。週と課題の対応                                                | 1週=1課題とは限らない(難しい課題は2週)。対応表を [学習ロードマップ](learning-roadmap.md) に記載                                            |                                                      |
| 5   | 指示書の構成案は `typescript-learning/` がルート、課題が `01-typescript-types`〜`12-final-project` | 実際のルートはこのリポジトリ。課題は**学習順**に並べ替え(DB・DIより先に検証・APIを学べるように)、CI/CDを12番にして最終課題を13番に         | [exercises/](exercises/)                             |
| 6   | 「CodeQL を実行する」(Step 4)だがローカルに CodeQL CLI は無い                                      | GitHub Actions 上で実行し、結果を確認する。ローカル実行は不要                                                                              | [ci-cd.md](ci-cd.md)                                 |
| 7   | 「実際のGitHubで動作確認できる範囲を確認する」                                                     | ライブテストは用意したが、**実在トークンでの実行はしていない**(リポジトリを作成してしまうため。ユーザーの承認なく行わない)。実行手順を記載 | [testing-strategy.md](testing-strategy.md)           |
| 8   | 「Secret Scanning の検証に実トークンを使わない」と「有効になっていることの確認」                   | 設定値を API で実測して確認。ブロックの実演はしない                                                                                        | [ADR-0015](adr/0015-repository-security-settings.md) |
| 9   | Owner が user か organization か(自動判定するか)                                                   | 入力で `ownerType` を必須にした                                                                                                            | [ADR-0005](adr/0005-github-authentication.md)        |
| 10  | リクエストを同期/非同期のどちらで処理するか                                                        | 同期 + 状態をDBに保存 + 中断の復旧                                                                                                         | [ADR-0006](adr/0006-synchronous-processing.md)       |
