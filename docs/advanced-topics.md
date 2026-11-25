# 発展課題集

12週間の課題を終えた後の、次のステップです。どれも「設計メモ(ADR形式)→ テストを先に → 実装」の順で。

## 設計・信頼性

1. **FAILED の再実行 API**(`POST /v1/repository-requests/{id}/retry`)+ 試行履歴テーブル(`request_attempts`)。状態遷移と冪等性はどう変わる?
2. **バックグラウンド実行への移行**: 202 Accepted + ワーカー(プロセス内ループ)。[ADR-0006](adr/0006-synchronous-processing.md) の案Bを実装し、復旧処理との関係を整理する
3. **サーキットブレーカー**と**バルクヘッド**(GitHub 呼び出しの同時数の上限)
4. **レート制限の事前制御**: `x-ratelimit-remaining` を見て呼び出しを間引く
5. **Outbox パターン**: 結果の通知(Webhook)を、DB保存と同じトランザクションで記録して、後で確実に送る
6. **複数プロセス対応**: SQLite を PostgreSQL に替える(Repository 差し替え + マイグレーション)、リースの競合を `SELECT ... FOR UPDATE SKIP LOCKED` で解く

## 機能の拡張

7. リポジトリの**更新・アーカイブ・削除**(危険な操作の設計: 確認・監査ログ・権限)
8. **ブランチ保護・チームの権限**の設定(GitHub API の別のエンドポイント。部分的な失敗の扱い=topics と同様)
9. テンプレートリポジトリからの作成(`POST /repos/{template_owner}/{template_repo}/generate`)
10. **Backstage の Software Template Action** から呼び出す(カスタムアクションを書く。このサービスは Backstage に依存しない設計のまま)

## セキュリティ

11. **API の認証・認可**: APIキー(ハッシュで保存)→ OIDC。要求の持ち主の概念と、演習07の知識を使う
12. **GitHub App** による認証(JWT → インストールトークン)。[ADR-0005](adr/0005-github-authentication.md)
13. **Rate limiting**(`@fastify/rate-limit`)と、CodeQL の `js/missing-rate-limiting` の関係
14. **SBOM** の生成と、`npm audit signatures`(来歴の検証)、`npm` の provenance
15. OpenSSF **Scorecard** をCIに追加し、結果を読む

## テスト・品質

16. **ミューテーションテストの自動化**(Stryker)。今回の10個のミュータントとの違いは?
17. **契約テスト**を、実GitHub(ライブ)と Fake の間にも作る(Fake が本物と食い違っていないか)
18. **負荷テスト**(autocannon)。同時リクエスト時の SQLite のロック競合・リースの挙動
19. **OpenTelemetry**(トレース・メトリクス)の導入。相関IDとの関係

## 運用

20. Docker 化(非必須要件)。非rootユーザー・マルチステージビルド・ヘルスチェック
21. **SLO** を決める(成功率・レイテンシ)。何を計測して、何で警告するか
22. `GET /healthz` を liveness / readiness に分ける。DB・GitHub の疎通をどう扱う?
