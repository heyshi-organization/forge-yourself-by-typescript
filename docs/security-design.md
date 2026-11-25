# セキュリティ設計

このリポジトリは **public** です。pushしたもの(ファイル・履歴・コミットメッセージ・author・Issue/PR・Actionsのログ)は、すべて誰でも見られます。

## 1. 脅威と対策の一覧

| 脅威                         | 対策                                                                                      | 実装 / 検証                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 不正な入力                   | Zod で型・長さ・形式・列挙値を検証。`strict()` で想定外のフィールドを拒否。ボディ上限16KB | `schemas/`, `ex04-*.test.ts`, `ex05-api.test.ts`                                                     |
| **SQLインジェクション**      | 値は常にバインド変数。許可リストで検証                                                    | `sqlite-request-repository.ts`, `ex09-sqlite-constraints.test.ts`「SQLインジェクション耐性」, 演習01 |
| **コマンドインジェクション** | このアプリはシェルを使わない。使う場合は `execFile` + 引数配列 + 入力検証                 | 演習02                                                                                               |
| **パストラバーサル**         | リポジトリ名の検証(`.` `..` `/` を拒否)。ファイルを扱う場合は解決後のパスを確認           | `repositoryNameSchema`, 演習03                                                                       |
| エラー情報の過剰な公開       | 利用者にはカタログの定型メッセージと相関IDのみ。詳細はログ                                | [ADR-0009](adr/0009-error-handling.md), `api.test.ts`, 演習06                                        |
| 秘密情報の管理               | 環境変数のみ。`.env` は `.gitignore`。`.env.example` はダミー値のみ                       | `schemas/config.ts`, `scan-secrets`                                                                  |
| **ログへの秘密の出力**       | キー名・トークン形式の二重のマスク。出力側で処理                                          | [ADR-0012](adr/0012-logging.md), `ex08-redact.test.ts`                                               |
| 外部API通信                  | 1回ごとのタイムアウト、リトライ上限、リダイレクトの扱い(演習08)                           | [ADR-0008](adr/0008-timeout-and-retry.md)                                                            |
| Mass Assignment              | 想定外のフィールドを拒否。サーバー側で決める項目(status 等)は入力から切り離す             | `strict()`, 演習04                                                                                   |
| **ローカル以外への公開**     | 既定で `127.0.0.1` のみ。`HOST` を変えると `ALLOW_PUBLIC_BIND=true` が無い限り起動拒否    | `schemas/config.ts`, `ex04-config.test.ts`                                                           |
| ログインジェクション         | `X-Correlation-Id` は形式が安全なときだけ引き継ぐ。入力に制御文字を許さない               | `http/app.ts`                                                                                        |
| 認証・認可                   | **このAPIには無い**(ローカル専用の前提)。公開するなら前段で必ず認証する                   | [ADR-0016](adr/0016-api-scope-and-openapi.md), 演習07                                                |
| 依存パッケージの脆弱性       | `npm audit`、Dependency Review、Dependabot、`--ignore-scripts`                            | [ci-cd.md](ci-cd.md)                                                                                 |
| Actions のサプライチェーン   | SHA固定、最小権限、`pull_request_target` 禁止、インジェクション対策                       | `scripts/check-workflows.mjs`                                                                        |

## 2. 公開リポジトリとして守ること(コミット前のチェック)

- **秘密情報**(トークン・パスワード・鍵・認証情報)と**個人情報**(メールアドレス・氏名・ローカルの絶対パス等)をコミットしない
- コミットする前に `npm run check:secrets`(`npm run verify` に含まれる)
- gitの author は GitHub の noreply アドレス(`<ID>+<ユーザー名>@users.noreply.github.com`)にする
- スクリーンショットを追加するときは、トークン・Client ID・メールアドレス等が写っていないか確認し、必要ならマスクする
- アカウントID・リソースIDなど、秘密ではないが**不要に公開する必要のない情報**も、教材に必要なければ載せない

### 秘密を漏らしてしまったら

1. **まずそのシークレットを無効化(ローテーション/失効)する** — 最優先。履歴を書き換えても、fork・キャッシュ・クローンには残る
2. 影響範囲を確認する(そのトークンで何ができたか、ログに不審なアクセスがないか)
3. 履歴の削除(必要なら)。ただし無効化の代わりにはならない
4. Actionsのログに出た場合は、ログを削除してローテーション

## 3. GitHub Actions のセキュリティ

| ルール                                                                                             | 理由                                                                                                                                                                                                                                                                                                                   | 検査                           |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| トップレベルの `permissions` を明示し、`write` を含めない。必要な job にだけ最小限を付ける         | 万一 job が乗っ取られても被害を限定する                                                                                                                                                                                                                                                                                | `check-workflows`(permissions) |
| Action は**コミットSHA(40桁)で固定**                                                               | タグは付け替えられる(Action のタグが悪意あるコミットに付け替えられ、それを使う多数のリポジトリで秘密が漏れた、という事例が実際にある)。GitHub公式の指針: [Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions) | pinned-actions                 |
| `pull_request_target` / `workflow_run` を使わない                                                  | fork の信頼できないコードに、書き込み権限・秘密を渡さない                                                                                                                                                                                                                                                              | dangerous-trigger              |
| `run:` に `${{ github.event.* }}` / `head_ref` / `secrets.*` を直接埋め込まない。`env:` 経由で渡す | シェルインジェクション(PRタイトルに `"; curl ...` と書かれる等)                                                                                                                                                                                                                                                        | script-injection               |
| `actions/checkout` は `persist-credentials: false`                                                 | トークンを `.git/config` に残さない                                                                                                                                                                                                                                                                                    | checkout                       |
| 全 job に `timeout-minutes`                                                                        | 暴走・課金の防止                                                                                                                                                                                                                                                                                                       | timeout                        |
| self-hosted ランナーを使わない                                                                     | public リポジトリでは、誰でもPRで自分のコードを実行できてしまう                                                                                                                                                                                                                                                        | runner                         |
| 第三者製 Action を避ける(公式のみ)                                                                 | 依存の信頼を最小に                                                                                                                                                                                                                                                                                                     | レビュー                       |
| `npm ci --ignore-scripts`                                                                          | 依存の install script を実行しない                                                                                                                                                                                                                                                                                     |                                |

**SHA固定の更新方法**: Dependabot(`github-actions`)が週次で PR を作る(SHA と `# vX.Y.Z` コメントを両方更新してくれる)。手動なら:

```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name                 # 最新のタグ
gh api repos/actions/checkout/git/ref/tags/<タグ> --jq '.object.type+" "+.object.sha'
# type が tag(注釈付きタグ)なら、さらに: gh api repos/actions/checkout/git/tags/<sha> --jq .object.sha
```

更新したら、`# v7.0.1` のようなコメントも更新する。

## 4. SAST: CodeQL

`.github/workflows/codeql.yml`(PR・main への push・週次)。`security-extended` クエリ。結果は GitHub の **Security → Code scanning**。

### 検出結果の扱い

| Severity        | 対応                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Critical / High | 原則そのPRで修正する(マージ前)                                                                     |
| Medium          | 原因と影響を確認。修正するか、理由つきで dismiss(`won't fix` / `false positive` / `used in tests`) |
| Low / Note      | 参考。まとめて対応                                                                                 |

**False Positive**(誤検知)は、コードを読んで「攻撃者が値を制御できない」「別の層で防がれている」ことを確認してから dismiss する(理由をコメントに残す)。
安易に dismiss せず、**まず本当に危険かを疑う**。

### CodeQL ができること・できないこと

[演習の結果と考察](../security-labs/README.md#codeql-の検出結果実測)を参照。一般に: データの流れ(taint tracking)で「外部入力 → 危険な処理」を検出するのは得意。
**認可の抜け(「この人にこの操作を許してよいか」)・ビジネスロジックの欠陥・設計上の問題は検出できない**。

## 5. SCA(依存関係)

| 仕組み                                    | 役割                                                 | 失敗条件            |
| ----------------------------------------- | ---------------------------------------------------- | ------------------- |
| `npm audit --omit=dev --audit-level=high` | 本番依存の既知の脆弱性                               | High 以上で CI 失敗 |
| Dependency Review(PR)                     | PRで**新たに追加・更新**される依存の脆弱性           | High 以上(runtime)  |
| Dependabot alerts                         | 既に使っている依存に新しい脆弱性が見つかったとき通知 | —                   |
| Dependabot security updates               | 修正版がある場合に PR を自動作成                     | —                   |
| Dependabot version updates                | 週次で更新 PR                                        | —                   |

### 脆弱性が検出されたときの対応手順

1. **影響を確認**: その脆弱性は、このアプリが使う機能・経路で到達可能か?(`npm audit` の経路 `npm ls <pkg>`、アドバイザリの条件)
2. **直接依存**: 修正版へ更新 → `npm run verify`
3. **間接依存**(依存の依存): 親の更新を待つ / `overrides`(package.json)で固定版を強制 → 後で外す(TODOとして残す)
4. 修正版が無い: 回避策(機能の無効化・入力の制限)、または代替ライブラリ。**リスクを受け入れる場合は期限と理由を記録**
5. 本番依存でなく開発専用(テストツール等)なら優先度を下げる(CIの失敗条件に含めていない理由)
6. 更新後、公開リポジトリでは**アドバイザリが公開された後**にPRを出す(未公開の脆弱性を先に書かない)

## 6. Secret Scanning

[ADR-0015](adr/0015-repository-security-settings.md): 有効化し、実測で確認済み(Push Protection 含む)。有料機能(non-provider patterns, validity checks)は未使用。補助として `scripts/scan-secrets.mjs`。

## 7. セキュリティ演習

[`security-labs/`](../security-labs/README.md)(8テーマ)。脆弱なコードの隔離: [ADR-0013](adr/0013-security-labs-isolation.md)。

## 8. 既知の限界

- このAPIには認証がない(ローカル専用の前提)
- `OctokitGitHubClient` のエラーメッセージ(GitHubの応答)は `cause` に残り、ログに出る。秘密は含まれない想定だが、マスクは「形」に基づく保険にすぎない
- SQLite のファイルは暗号化していない(ローカルの開発用途)。ファイルの権限はOSに任せている
