# 課題04: 入力値検証(Zod・設定)

**週4** / 実装場所: `starter/src/schemas/repository.ts`, `starter/src/schemas/config.ts`

## 1. 課題の目的

HTTPで届く JSON と環境変数は、**型が何と言おうと、実行時には何が入っているか分からない**。Zod で検証し、検証を通った値だけを型付きで扱う。
**1つのスキーマ定義から、実行時の検証と TypeScript の型の両方を得る**(二重管理しない)。

## 2. 学習する概念

型アサーション(`as`)と検証の違い / Zod(`string` `number` `boolean` `enum` `array` `object` `strict` `regex` `refine` `superRefine` `default` `optional` `coerce` `safeParse`) / `z.infer` / 許可リスト(allowlist) / Mass Assignment / 環境変数と設定の検証 / ESM のモジュール

## 3. 背景知識

### 実験: `as` は検証ではない(やってみよう)

```ts
interface Body {
  name: string;
}
const body = JSON.parse('{"name": 123}') as Body; // コンパイルは通る
body.name.toUpperCase(); // 実行時に TypeError!
```

`as` は「コンパイラ、私を信じて」というだけ。**外部入力は `unknown` として受け取り、検証してから型を付ける**。

### Zod の基本

```ts
import { z } from 'zod';
const userSchema = z
  .object({ name: z.string().min(1).max(50), age: z.number().int().optional() })
  .strict();
type User = z.infer<typeof userSchema>; // { name: string; age?: number | undefined }

const r = userSchema.safeParse(input); // 例外を投げず、結果を返す
if (r.success) r.data; /* User */
else r.error.issues; /* [{ path, message, code }] */
```

- `.default(v)`: 未指定のとき `v` を入れる(検証後の型では必須になる)
- `.strict()`: スキーマに無いキーを**エラーにする**(無いと、黙って捨てられる)
- `z.coerce.number()`: 文字列(クエリ・環境変数)を数値に変換してから検証
- `.refine(fn, msg)`: 独自の条件。`.superRefine((v, ctx) => ctx.addIssue(...))`: 複数項目にまたがる条件・複数のエラー

### 設計の方針

- **許可リスト**(使ってよい文字を決める)。拒否リスト(危険な文字を禁止)は、抜け漏れが出やすい
- エラーメッセージに**入力値そのものを含めない**(秘密の反射・ログ汚染を避ける)
- 設定エラーでは、**どの変数が悪いか**だけを示し、値(トークン)は出さない

## 4. 実装する機能

### `schemas/repository.ts`

| 名前                         | 仕様                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryNameSchema`       | 文字列。1〜100文字。使える文字は `A-Z a-z 0-9 . _ -`。`.` と `..` は不可。`.git` で終わる名前は不可(大文字小文字を区別しない)                                                                                                                                                                         |
| `ownerSchema`                | 1〜39文字。英数字とハイフン。先頭・末尾はハイフン不可。連続ハイフン(`--`)不可                                                                                                                                                                                                                         |
| `topicSchema`                | `^[a-z0-9][a-z0-9-]{0,49}$`                                                                                                                                                                                                                                                                           |
| `createRepositoryBodySchema` | オブジェクト(`strict`)。`owner`(必須)/ `ownerType`(`user`\|`organization`、必須)/ `name`(必須)/ `visibility`(`public`\|`private`、必須)/ `description`(任意。350文字以内。制御文字 `\u0000-\u001f` `\u007f` は不可)/ `autoInit`(boolean、既定 `false`)/ `topics`(配列。最大20個。重複不可。既定 `[]`) |
| `CreateRepositoryBody`       | `z.infer` で導出する型(手書きしない)                                                                                                                                                                                                                                                                  |
| `toRepositorySpec(body)`     | 検証済みの `CreateRepositoryBody` を、ドメインの `RepositorySpec` に変換。`description` が未指定なら `null`                                                                                                                                                                                           |
| `idempotencyKeySchema`       | `^[A-Za-z0-9_-]{8,128}$`                                                                                                                                                                                                                                                                              |
| `listQuerySchema`            | `strict`。`limit`(整数 1〜100、既定20)/ `offset`(整数 0以上、既定0)/ `status`(任意。4つの状態のどれか)。**文字列から数値へ変換**される(`z.coerce`)                                                                                                                                                    |
| `ListQuery`                  | `z.infer` で導出                                                                                                                                                                                                                                                                                      |
| `requestIdParamSchema`       | 用意済み(`{ id: string }` の例)                                                                                                                                                                                                                                                                       |

`REQUEST_STATUSES` `OWNER_TYPES` `VISIBILITIES`(課題01で使った配列)を `z.enum(...)` に渡せる。

### `schemas/config.ts`

`parseConfig(env: Record<string, string | undefined>): AppConfig`(`AppConfig` と `ConfigError` は用意済み)

| 環境変数              | 検証                                                   | 既定                |
| --------------------- | ------------------------------------------------------ | ------------------- |
| `HOST`                | 文字列                                                 | `127.0.0.1`         |
| `PORT`                | 整数 0〜65535                                          | 3000                |
| `ALLOW_PUBLIC_BIND`   | `'true'` \| `'false'`                                  | `'false'`           |
| `DB_PATH`             | 空でない文字列                                         | `./data/app.sqlite` |
| `LOG_LEVEL`           | `fatal` `error` `warn` `info` `debug` `trace` `silent` | `info`              |
| `GITHUB_CLIENT`       | `octokit` \| `fake`                                    | `octokit`           |
| `GITHUB_TOKEN`        | 空でない文字列(任意)                                   | —                   |
| `GITHUB_TIMEOUT_MS`   | 整数 100〜60000                                        | 10000               |
| `GITHUB_MAX_ATTEMPTS` | 整数 1〜10                                             | 4                   |
| `PROCESSING_LEASE_MS` | 整数 1000以上                                          | 300000              |

追加ルール(複数項目にまたがる):

- `GITHUB_CLIENT=octokit` のときは `GITHUB_TOKEN` が必須
- `HOST` が `127.0.0.1` `localhost` `::1` 以外のときは、`ALLOW_PUBLIC_BIND=true` が必須。**エラーメッセージに `ALLOW_PUBLIC_BIND` という名前を含める**(ローカル以外に不用意に公開させない)

検証に失敗したら `ConfigError` を投げる。メッセージは `変数名: 理由`(**値を含めない**)。`AppConfig` のフィールド(`githubToken` など)への対応は `AppConfig` を見ること。

## 5. 実装対象ファイル

`starter/src/schemas/repository.ts` / `starter/src/schemas/config.ts`。`schemas/setup.ts`(Zod のエラーメッセージを日本語にする設定)は用意済み。

## 6. 受け入れ条件

- [ ] 上の表のとおり、有効な値は通り、無効な値は拒否される(境界値: 0文字/1文字/100文字/101文字、`.`/`..`/`.git`、制御文字、重複topics…)
- [ ] 想定外のフィールド(`isAdmin: true`)を拒否する。ボディが `null` や配列でも拒否する
- [ ] `autoInit` と `topics` の既定値が入る。`description` 未指定 → `toRepositorySpec` で `null`
- [ ] `CreateRepositoryBody` / `ListQuery` が `z.infer` で導出され(型テスト)、`autoInit: boolean` は必須(`default` を理由に)、`description` は `string | undefined`
- [ ] クエリは文字列から数値に変換され、範囲外・数値でない値は拒否
- [ ] エラーメッセージに入力値が含まれない(`name` に秘密が入っていても反射しない)
- [ ] `parseConfig`: fake なら token 不要、octokit なら必須。ループバック以外の `HOST` は `ALLOW_PUBLIC_BIND=true` なしだと拒否。範囲外・数値でない値を拒否。**トークンの値がエラーに出ない**
- [ ] 検証ルールの**重複した手書きの型**が無い

## 7. テスト方法

```bash
npm run exercise -- 04     # ex04-schemas / ex04-config(Property-based 含む)と型テスト ex04-inference.test-d.ts
```

## 8. 段階的なヒント

<details><summary>ヒント1: 名前のスキーマ</summary>

`z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/)` に、`.refine(v => v !== '.' && v !== '..')` と `.refine(v => !v.toLowerCase().endsWith('.git'))` を足す。
`refine` のメッセージ(第2引数)は日本語で。

</details>

<details><summary>ヒント2: ボディとの型</summary>

`z.object({...}).strict()`。`autoInit: z.boolean().default(false)`、`topics: z.array(topicSchema).max(20).refine(arr => new Set(arr).size === arr.length).default([])`。
型は `export type CreateRepositoryBody = z.infer<typeof createRepositoryBodySchema>;`。
(`default` を付けると、`z.infer`(検証後の型)では必須になる。入力の型が欲しければ `z.input`)

</details>

<details><summary>ヒント3: 設定</summary>

環境変数は全部「文字列」。`PORT` などは `z.coerce.number().int()`。複数項目の条件は `z.object({...}).superRefine((env, ctx) => { ctx.addIssue({ code: 'custom', path: ['GITHUB_TOKEN'], message: '...' }) })`。
`parseConfig` では `safeParse` して、`error.issues` から `` `${issue.path.join('.')}: ${issue.message}` `` の配列を作り、`new ConfigError(...)`。**`error.message` や入力の `env` をそのまま出さない**。

</details>

## 9. 発展課題

1. `.transform()` で `owner` を小文字に正規化する(正規化した後の値でハッシュが変わらないか考える)
2. `z.discriminatedUnion('ownerType', [...])` で、`user` と `organization` で別の制約を持たせる
3. バリデーションエラーを RFC 9457(Problem Details)形式で返すよう、課題05のエラー形式を拡張する案を書く
4. `z.input` と `z.output` の違いを、`default` / `coerce` / `transform` で確かめる

## 10. 完了後に理解しておくべきこと

- **型は実行時に消える**ので、外部入力は必ず実行時に検証する(型だけでは守れない)
- スキーマから型を導出すると、仕様と型が食い違わない(Single Source of Truth)
- 許可リストの考え方と、`strict()`(Mass Assignment 対策)の意味
- エラーメッセージに何を含めてよいか/いけないか
- 設定も入力。起動時に検証し、危険な設定(公開バインド)は明示させる
