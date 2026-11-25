# ADR-0012: ログ設計

- 状態: 採用
- 日付: 2026-11-25

## 決定

- **構造化ログ**(JSON Lines)。Pino(Fastify標準)。1行1イベントで、機械で検索・集計できる
- 必須フィールド: `time`, `level`, `msg`, `service`
- **2種類のIDを区別する**
  - `correlationId`: HTTPリクエスト1回ごと(`X-Correlation-Id` を引き継ぐ。形式が不正なら新規発行=ログ汚染対策)
  - `requestId`: リポジトリ作成要求(Provisioning Request)のID。DBの主キー
- 記録する内容(要件F)
  - HTTP: メソッド・URL・ステータス・`responseTime`(Fastify標準の `incoming request` / `request completed`)
  - 処理: 要求の開始・完了・失敗(`requestId`, `status`, `code`)
  - 外部API: `operation`, `attempt`, `outcome`(ok/error), `kind`, `status`, `durationMs`、再試行の `delayMs`
  - エラー: `err`(スタックトレース含む。**利用者には返さない**)
- **秘密情報を出さない**(多層)
  1. トークンは `OctokitGitHubClient` の外に出さない設計
  2. pino の `redact` でキー名(`token`, `authorization` など)を伏せる
  3. 出力する**1行ごと**に、トークン形式(`ghp_...`, `github_pat_...`, `Bearer ...`, URL内の認証情報)を伏せる(最後の防衛線)
  4. エラーオブジェクトも `redactSecrets` を通す(`message`, `stack`, `cause`)
  5. 入力検証エラーに入力値を含めない

## なぜ「出力側」でマスクするのか(失敗から学んだこと)

最初は pino の `formatters.log` で `redactSecrets` を呼んだが、`formatters.log` は **serializers より前**に動くため、
Fastify の `req`/`res` オブジェクトを壊し、ログの `res` が `{}` になった(テストで発見)。
出力する直前(シリアライズ後の文字列)で処理する方式にして解決した。→ [exercises/tests/ex08-redact.test.ts](../../exercises/tests/ex08-redact.test.ts)

## 受け入れるトレードオフ

文字列の形で判定するため、**未知の形式の秘密は伏せられない**。キー名・形式のどちらにも当てはまらない秘密を `msg` に書けば漏れる。
→ 「秘密になりうる値をそもそもログに渡さない」が第一、マスクは保険。
