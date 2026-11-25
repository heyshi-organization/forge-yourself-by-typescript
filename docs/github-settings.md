# GitHub 側で必要な設定

コードだけでは設定できない項目と、その手順です。**このリポジトリで確認・設定した状況**も記録します。

## 1. 設定済み(2026-11-25 に API で設定し、実測で確認)

| 設定                        | 状態    | 確認コマンド                                                        |
| --------------------------- | ------- | ------------------------------------------------------------------- |
| Secret Scanning             | enabled | `gh api repos/<owner>/<repo> --jq .security_and_analysis`           |
| Push Protection             | enabled | 同上                                                                |
| Dependabot alerts           | enabled | `gh api repos/<owner>/<repo>/vulnerability-alerts -i`(204 なら有効) |
| Dependabot security updates | enabled | `security_and_analysis.dependabot_security_updates`                 |

有効化のコマンド(リポジトリの管理者権限が必要):

```bash
gh api -X PATCH repos/<owner>/<repo> --input - <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},
 "secret_scanning_push_protection":{"status":"enabled"},
 "dependabot_security_updates":{"status":"enabled"}}}
JSON
gh api repos/<owner>/<repo> --jq .security_and_analysis    # ← 必ず再取得して enabled を確認する
gh api -X PUT repos/<owner>/<repo>/vulnerability-alerts    # Dependabot alerts を有効化
```

(自分の fork / コピーでは、自分で上記を実行してください。設定はリポジトリごとです)

## 2. 手動で設定する(未設定)

> ブランチ保護は、リポジトリの運用ルールを変える設定のため、**自動では変更していません**。

### 2-1. main ブランチの保護(Ruleset)

GitHub: **Settings → Rules → Rulesets → New branch ruleset**

| 項目                                      | 設定                                                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                                      | `protect-main`                                                                                                                                                                                                                   |
| Enforcement status                        | Active                                                                                                                                                                                                                           |
| Target branches                           | Include default branch(`main`)                                                                                                                                                                                                   |
| **Restrict deletions**                    | ✅                                                                                                                                                                                                                               |
| **Block force pushes**                    | ✅                                                                                                                                                                                                                               |
| **Require a pull request before merging** | ✅(Required approvals: 個人利用なら 0 でもよい。チームなら 1 以上)                                                                                                                                                               |
| **Require status checks to pass**         | ✅ → 追加: `品質検査(型・lint・フォーマット・テスト)`, `依存関係の脆弱性検査(npm audit)`, `CodeQL 解析(javascript-typescript)`, `依存関係レビュー`, `演習コードを main に入れない`(**一度ワークフローが実行されると候補に出る**) |
| Require branches to be up to date         | 任意                                                                                                                                                                                                                             |
| (任意)Require code scanning results       | CodeQL: Tool=CodeQL, Alerts threshold=High or higher                                                                                                                                                                             |

CLI で作る場合(JSON を用意):

```bash
gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/protect-main.json
```

→ サンプル: [`.github/rulesets/protect-main.json`](../.github/rulesets/protect-main.json)(ステータスチェック名は、実際のジョブ名と合わせること。**このサンプルは、この教材の作成時には適用の動作確認をしていない=未検証**。適用前に内容を確認すること)

> ⚠️ 無料プランの**組織**の private リポジトリでは Ruleset / ブランチ保護が使えない場合があります(public なら使えます)。使えない場合の代替は、PR運用をルール化し、`CODEOWNERS`・レビュー習慣で補うこと。
> この点は、**GitHub のプラン説明(Docs)で最終確認していません(未確認)**。public リポジトリである本リポジトリでの適用可否は、設定画面で確認してください。

### 2-2. Actions の設定

**Settings → Actions → General**

| 項目                                                       | 推奨                                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions permissions                                        | _Allow `<owner>`, and select non-`<owner>`, actions and reusable workflows_ → _Allow actions created by GitHub_ のみ許可(必要なものだけ許可リストに追加)       |
| **Fork pull request workflows from outside collaborators** | **Require approval for all outside collaborators**(fork からのPRのワークフローは承認してから実行)                                                              |
| Workflow permissions                                       | **Read repository contents and packages permissions**(既定の GITHUB_TOKEN を読み取り専用に)。_Allow GitHub Actions to create and approve pull requests_ は OFF |

> このリポジトリでは**セルフホストランナーを使いません**(public リポジトリでは危険。誰でもPRでランナー上のコードを実行できる)。

### 2-3. その他

| 設定                            | 場所                                                      | 内容                                           |
| ------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| Private vulnerability reporting | Settings → Code security                                  | 有効化すると、脆弱性を非公開で報告してもらえる |
| 自動でブランチ削除              | Settings → General → _Automatically delete head branches_ | マージ後に feature ブランチを削除              |
| マージ方法                      | Settings → General → Pull Requests                        | Squash merge のみ許可すると履歴が読みやすい    |
| `SECURITY.md`                   | リポジトリ                                                | 脆弱性の報告方法(このリポジトリに用意済み)     |

## 3. 利用できない/未使用の機能

[ADR-0015](adr/0015-repository-security-settings.md) を参照(non-provider patterns・validity checks は有料機能と理解しており未使用)。

## 4. 学習者(自分のコピーで学ぶ人)向け

1. このリポジトリを **fork** するか、テンプレートとして**自分のアカウント**にコピーする(Public でも Private でもよい)
2. 上の 1(Secret Scanning 等)を自分のリポジトリで有効化する
3. 2-1 のブランチ保護を設定し、PR 経由で `main` に変更を入れる練習をする
4. `Actions` タブでワークフローを有効にする(fork ではワークフローが無効のことがある)
