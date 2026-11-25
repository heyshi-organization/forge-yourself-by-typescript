# CI/CD(GitHub Actions)

判断の理由: [ADR-0014](adr/0014-ci-quality-gates.md)。セキュリティ上のルール: [security-design.md](security-design.md#3-github-actions-のセキュリティ)。

## 1. ワークフロー一覧

| ファイル                | トリガー                           | 内容                                                                             | 権限                                                                              |
| ----------------------- | ---------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ci.yml`                | PR / main への push / 手動         | 品質検査(`quality`)、依存の脆弱性(`audit`)、課題の進捗(`starter-progress`・参考) | `contents: read`                                                                  |
| `codeql.yml`            | PR / main への push / 毎週月曜     | SAST(CodeQL)                                                                     | `contents: read`, `actions: read`, **`security-events: write`**(結果の登録に必要) |
| `dependency-review.yml` | PR                                 | PR で追加・更新される依存の脆弱性                                                | `contents: read`                                                                  |
| `exercise-guard.yml`    | PR                                 | `exercise/*` ブランチ・`lab-workspace/` を含む PR を失敗させる                   | `contents: read`                                                                  |
| `starter-sync.yml`      | `reference/src` を変えた PR / push | starter の再生成漏れを検出                                                       | `contents: read`                                                                  |
| `dependabot.yml`(設定)  | 週次                               | npm と GitHub Actions の更新 PR                                                  | —                                                                                 |

トップレベルの `permissions` は `{}`(権限なし)。**書き込み権限を持つのは CodeQL の `security-events: write` だけ**。

## 2. `ci.yml` の `quality` ジョブの中身(ローカルでは `npm run verify`)

| ステップ                       | コマンド                                     | 失敗すると                  |
| ------------------------------ | -------------------------------------------- | --------------------------- |
| 依存インストール               | `npm ci --ignore-scripts`                    |                             |
| 型検査                         | `npm run typecheck`                          | reference と starter の両方 |
| ESLint                         | `npm run lint`                               | エラーで失敗                |
| Prettier                       | `npm run format:check`                       |                             |
| テスト + カバレッジ            | `npm run test:coverage`                      | 失敗 or 閾値未満            |
| 受け入れテスト(完成形)         | `npm run exercise:verify`                    | 教材が壊れている            |
| ミューテーション検査の自己検証 | `node scripts/check-mutants.mjs --self-test` |                             |
| セキュリティ演習の健全性       | `npm run lab:verify`                         |                             |
| ワークフロー検査               | `npm run check:workflows`                    |                             |
| 秘密情報の検査                 | `npm run check:secrets`                      |                             |
| ビルド                         | `npm run build`                              |                             |

## 3. 品質ゲート(PRを完了させない条件)

「**必須のステータスチェック**」に設定すると、失敗している PR はマージできなくなる(設定手順は [github-settings.md](github-settings.md))。推奨:

| 必須にする                                      | 必須にしない                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `CI / 品質検査`                                 | `CI / 課題の進捗(参考情報)`                                                                                          |
| `CI / 依存関係の脆弱性検査`                     | `Starter Sync`(`reference/src` を変えたときだけ動く。パスフィルタの都合で、必須にすると「保留」のままになるPRが出る) |
| `CodeQL / CodeQL 解析`                          |                                                                                                                      |
| `Dependency Review / 依存関係レビュー`          |                                                                                                                      |
| `Exercise Guard / 演習コードを main に入れない` |                                                                                                                      |

> CodeQL の**検出結果(アラート)**は、このジョブの成否とは別。ジョブは「解析できたか」で成否が決まり、アラートは Security タブで確認・対応する。
> 「検出されたら必ず失敗」にもできる(Ruleset の _Require code scanning results_)が、誤検知で開発が止まる運用になりやすいので、
> まず Severity が High 以上のものだけを必須にする運用から始めるのがよい。

## 4. 学習者のワークフロー(PRを作ってCIを見る)

```bash
git switch -c feature/ex03-retry
# starter/src を実装 → npm run exercise -- 03
npm run verify         # CIと同じ検査(starter の未実装による失敗を除く)
git add -A && git commit -m "feat: 課題03の実装"
git push -u origin feature/ex03-retry
gh pr create --fill    # PR を作る → Actions の結果が PR に表示される
```

- **自分の fork / コピーのリポジトリ**で行うこと。`exercise/*` ブランチは**マージしない**(ガードが失敗する)
- `quality` ジョブには「完成形」に対する検査が含まれ、starter の実装状況には影響されない。`starter-progress` に進捗が出る

## 5. 失敗したときの調べ方

1. PR の Checks → 失敗したジョブ → ログ。**失敗したステップを、ローカルで同じコマンドで再現する**(`npm run verify` の該当ステップ)
2. `npm ci` で失敗: `package-lock.json` が `package.json` と一致していない → `npm install` してロックファイルをコミット
3. CodeQL の解析が失敗: ログを読む。Security タブの **Code scanning → Tool status** も見る
4. Dependency Review が失敗: 追加した依存に High 以上の脆弱性。アドバイザリのリンクから、修正版へ上げる

## 6. 手動で再実行・確認

```bash
gh run list --limit 5
gh run view <run-id> --log-failed
gh pr checks <PR番号>
```
