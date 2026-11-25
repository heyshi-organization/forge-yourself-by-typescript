# 課題一覧

12個の課題 + 最終課題。**番号順**に進めます(後ろの課題は、前の課題の実装を使います)。週との対応は [学習ロードマップ](../learning-roadmap.md)。

| #                                | 課題                                         | 週  | 実装する場所(`starter/src/` 配下)                                                        | 確認                     |
| -------------------------------- | -------------------------------------------- | --- | ---------------------------------------------------------------------------------------- | ------------------------ |
| [01](01-typescript-types.md)     | TypeScriptの型(ドメインモデル・状態遷移)     | 1   | `domain/request.ts` `domain/state-machine.ts`                                            | `npm run exercise -- 01` |
| [02](02-generics.md)             | ジェネリクス(Result / Page)                  | 2   | `shared/result.ts` `shared/page.ts`                                                      | `-- 02`                  |
| [03](03-async-await.md)          | 非同期処理(タイムアウト・リトライ・並行制御) | 3   | `async/timeout.ts` `async/retry.ts` `async/concurrency.ts`                               | `-- 03`                  |
| [04](04-validation.md)           | 入力値検証(Zod・設定)                        | 4   | `schemas/repository.ts` `schemas/config.ts`                                              | `-- 04`                  |
| [05](05-api-design.md)           | API設計(Fastify)                             | 5   | `http/errors.ts` `http/app.ts`                                                           | `-- 05`                  |
| [06](06-dependency-injection.md) | 依存性の注入(DI)とサービス層                 | 6   | `db/in-memory-request-repository.ts` `services/provisioning-service.ts` `composition.ts` | `-- 06`                  |
| [07](07-testing.md)              | テストを書く(ミューテーション検査)           | 7   | `starter/test/ex07-retry.test.ts`                                                        | `-- 07`                  |
| [08](08-error-handling.md)       | エラーハンドリング                           | 8   | `github/classify.ts` `provisioning/resilient-provisioner.ts` `logging/redact.ts`         | `-- 08`                  |
| [09](09-database.md)             | データベース(SQLite)                         | 9   | `db/migrations.ts` `db/sqlite-request-repository.ts`                                     | `-- 09`                  |
| [10](10-idempotency.md)          | 冪等性と障害からの復旧                       | 10  | `services/provisioning-service.ts`(`submit` `recover` `recoverStale`)                    | `-- 10`                  |
| [11](11-security.md)             | セキュリティ演習                             | 11  | `lab-workspace/`(`exercise/*` ブランチ)                                                  | `-- 11`                  |
| [12](12-ci-cd.md)                | CI/CD(GitHub Actions)                        | 12  | `starter/ci/ci.yml`                                                                      | `-- 12`                  |
| [13](13-final-project.md)        | 最終課題(レビュー・品質改善・ライブテスト)   | 12  | —                                                                                        | `npm run verify`         |

## 共通のルール

1. **課題文 → 自分で設計 → 実装 → 受け入れテスト**の順。ヒントは `ヒント1 → 2 → 3`(だんだん具体的)。詰まったら `reference/`(最後の手段)
2. `TODO(exNN)` と書かれた箇所、または `NotImplementedError('NN')` を投げている箇所が、その課題で実装する場所。それ以外は**最初から用意された部分(given)**で、変更しない
3. テストファイルは**読んでよい**(仕様書として)。ただし、テストを通すためだけの実装(テストの入力を決め打ちする等)はしない
4. コミットは小さく。`npm run verify`(starter の未実装による失敗を除く)を、PRの前に実行する
5. AI に相談するときは、**自分の案を先に書く**

## 受け入れテストの読み方

```
exercises/tests/
  ex03-retry.test.ts            ← 実行時テスト(Vitest)。`it('…')` の日本語が受け入れ条件
  ex03-timeout-concurrency.test.ts
  ex01-types.test-d.ts          ← 型テスト(`*.test-d.ts`)。コンパイルが通れば合格(`expectTypeOf`)
```

- `npm run exercise -- 03`: 課題03のテストだけを実行。失敗したテスト名が「何ができていないか」
- `npm run exercise -- 03 --reference`: 完成形で同じテストを実行(=テストが正しいことの確認。通常は不要)
