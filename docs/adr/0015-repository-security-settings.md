# ADR-0015: リポジトリのセキュリティ設定(Secret Scanning 等)

- 状態: 採用
- 日付: 2026-11-25

## 背景

要件: Secret Scanning 等の利用可否を**現行のプラン・設定条件で調査**する。**有効になっていない状態を完了扱いにしない**。

## 調査結果(2026-11-25、`gh api` で実測)

対象: `heyshi-organization/forge-yourself-by-typescript`(public、組織プラン: `free`)

| 機能                                                           | 調査時点                            | 対応後                                                   | 備考                                                                                             |
| -------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Secret Scanning(partner patterns + 自分のリポジトリのアラート) | `disabled`                          | **`enabled`**                                            | public リポジトリは無料で利用可                                                                  |
| Push Protection                                                | `disabled`                          | **`enabled`**                                            | シークレットを含む push をブロック                                                               |
| Dependabot alerts(脆弱性アラート)                              | 有効(`vulnerability-alerts` が 204) | 有効                                                     |                                                                                                  |
| Dependabot security updates                                    | `disabled`                          | **`enabled`**                                            | 脆弱な依存の修正PRを自動作成                                                                     |
| Dependabot version updates                                     | —                                   | `.github/dependabot.yml` で設定                          | 設定ファイルによる(上のAPI設定とは別)                                                            |
| Secret scanning: non-provider patterns                         | `disabled`                          | `disabled`(利用しない)                                   | 追加のパターン検出。**有料プラン(GitHub Secret Protection)の機能**と理解している ※要確認         |
| Secret scanning: validity checks                               | `disabled`                          | `disabled`(利用しない)                                   | トークンが有効かの検証。同上                                                                     |
| Code scanning(CodeQL)                                          | default setup は `not-configured`   | **advanced setup**(`.github/workflows/codeql.yml`)を採用 | default setup は設定が自動で、ワークフローとして見えない。学習用に中身を見える advanced を選んだ |

「対応後」は、`gh api -X PATCH` で有効化したあと、**再度 GET して `enabled` になっていることを確認**した(設定だけ書いて終わりにしていない)。

## 事実と推測

- 事実: 上表の「調査時点」「対応後」は API の実測値
- 推測(未確認): non-provider patterns / validity checks が有料機能であること。プランの案内(GitHub Docs)で確認していない
- 確認できていないこと: 実際にシークレットを push してブロックされる様子(**実在トークンの使用は禁止**のため行っていない。フォーマットだけ似せたダミーでの検証は、誤検知・誤ブロックの恐れがあり、リポジトリ履歴を汚すので行わない)

## 代替・補助

- `scripts/scan-secrets.mjs`(CIで実行): トークン形式・秘密鍵・個人のメールアドレス・ローカルパスの混入を検査
- Push Protection をバイパスされた場合に備え、**漏れたらまず無効化(ローテーション)する**運用を [docs/security-design.md](../security-design.md) に記載

## 手動で必要な設定

ブランチ保護(Ruleset)、Private vulnerability reporting 等は [docs/github-settings.md](../github-settings.md)。
