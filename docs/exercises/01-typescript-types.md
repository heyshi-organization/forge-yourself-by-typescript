# 課題01: TypeScriptの型(ドメインモデルと状態遷移)

**週1** / 実装場所: `starter/src/domain/request.ts`, `starter/src/domain/state-machine.ts`, `starter/src/http/resource.ts`(1行)

## 1. 課題の目的

アプリの中心となるデータ「作成要求」を、**型で正しく表現**する。状態(`PENDING` など)ごとに持つデータが違うことを型で表し、
「SUCCEEDED なのに GitHub の情報が無い」ような**ありえないデータを、そもそも書けなくする**。状態遷移のルールも実装する。

## 2. 学習する概念

`type` と `interface` / リテラル型 / Union型 / **判別可能Union** / Type Narrowing / `readonly` / `as const` と `typeof` / 型推論 / `never` と網羅性チェック

## 3. 背景知識

**型は実行時には消える**(コンパイルすると無くなる)。型は「コンパイラに間違いを見つけさせる」ための道具。

```ts
// リテラル型とUnion: 「この3つのうちのどれか」
type Color = 'red' | 'green' | 'blue';

// 配列から型を作る(値と型の二重管理を避ける)
const COLORS = ['red', 'green', 'blue'] as const; // ['red','green','blue'] を readonly タプルとして推論
type Color2 = (typeof COLORS)[number]; // 'red' | 'green' | 'blue'

// 判別可能Union: 共通のリテラルフィールド(判別子)で、どの型かが分かる
type Shape = { kind: 'circle'; radius: number } | { kind: 'rect'; width: number; height: number };

function area(s: Shape): number {
  switch (s.kind) {
    case 'circle':
      return Math.PI * s.radius ** 2; // ここでは s は circle に絞り込まれている
    case 'rect':
      return s.width * s.height;
    default:
      return assertNever(s); // 網羅していないと、ここでコンパイルエラーになる
  }
}
```

`interface` と `type`: オブジェクトの形はどちらでも書ける。**Union や `typeof` から作る型は `type` でしか書けない**。迷ったら、オブジェクトの形は `interface`、それ以外は `type`。
(このプロジェクトでは、ポート/オブジェクトの形は `interface`、Union は `type`)

状態ごとに持つフィールド:

| status       | 追加で持つフィールド                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `PENDING`    | なし                                                                                                 |
| `PROCESSING` | `startedAt: string`                                                                                  |
| `SUCCEEDED`  | `startedAt`, `finishedAt: string`, `repository: GitHubRepositoryInfo`, `warnings: readonly string[]` |
| `FAILED`     | `startedAt`, `finishedAt: string`, `error: RequestError`                                             |

## 4. 実装する機能

### `domain/request.ts`

`REQUEST_STATUSES` / `VISIBILITIES` / `OWNER_TYPES`(`as const` の配列)は**最初から用意**されている。これを使って次の型を定義する。

| 型                                           | 内容                                                                                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RequestStatus` / `Visibility` / `OwnerType` | 上の配列の要素の Union(配列から導出する)                                                                                                                                                |
| `RepositorySpec`                             | `owner: string`, `ownerType: OwnerType`, `name: string`, `description: string \| null`, `visibility: Visibility`, `autoInit: boolean`, `topics: readonly string[]`(**すべて readonly**) |
| `GitHubRepositoryInfo`                       | `id: number`, `fullName: string`, `htmlUrl: string`, `createdAt: string`                                                                                                                |
| `RequestError`                               | `code: string`, `message: string`                                                                                                                                                       |
| `RepositoryRequest`                          | **判別可能Union**。共通: `id`, `idempotencyKey`, `requestHash`(string), `spec: RepositorySpec`, `createdAt`, `updatedAt`(string)。`status` が判別子。状態ごとの追加フィールドは上の表   |

### `domain/state-machine.ts`

| 関数                               | 仕様                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_TRANSITIONS`              | `Record<RequestStatus, readonly RequestStatus[]>`。`PENDING→PROCESSING`、`PROCESSING→SUCCEEDED/FAILED`、`SUCCEEDED`/`FAILED` は何にも遷移できない |
| `canTransition(from, to)`          | 許可されるか                                                                                                                                      |
| `isTerminal(status)`               | 終端状態(これ以上遷移できない)か                                                                                                                  |
| `assertTransition(from, to)`       | 許可されなければ `InvalidTransitionError`(用意済み)を投げる                                                                                       |
| `assertNever(value: never): never` | 到達したら `Error` を投げる(網羅性チェック用)                                                                                                     |

### `http/resource.ts`

`default: return assertNever(request as never)` の `as never` を**外しても**コンパイルが通るようにする(あなたの型が正しい証拠)。

## 5. 実装対象ファイル

- `starter/src/domain/request.ts`(`= any` の暫定の型を、本物に置き換える)
- `starter/src/domain/state-machine.ts`
- `starter/src/http/resource.ts`(`as never` を外す)

## 6. 受け入れ条件

- [ ] `RequestStatus` が `'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'` と**厳密に等しい**(`REQUEST_STATUSES` から導出)
- [ ] `RepositorySpec` が `readonly`(代入しようとするとコンパイルエラー)
- [ ] `RepositoryRequest` を `status` で絞り込むと、状態ごとのフィールドが使える。**絞り込む前は `repository` や `error` に触れない**
- [ ] `PENDING` には `repository` も `startedAt` も無い(アクセスするとコンパイルエラー)
- [ ] 許可される遷移が `PENDING→PROCESSING`、`PROCESSING→SUCCEEDED`、`PROCESSING→FAILED` の3つだけ
- [ ] `isTerminal` は `SUCCEEDED` と `FAILED` だけが true
- [ ] `assertTransition` が不正な遷移で `InvalidTransitionError`、`assertNever` が例外
- [ ] `resource.ts` の `as never` を外してもコンパイルできる
- [ ] 型の定義に `any` と `as` を使っていない

## 7. テスト方法

```bash
npm run exercise -- 01          # 型テスト(ex01-types.test-d.ts)と実行時テスト(ex01-state-machine.test.ts)
npm run typecheck               # 型エラーが無いこと
```

型テストの失敗は、`expected ... to equal ...` のように、**どの型がずれているか**が出る。

## 8. 段階的なヒント

<details><summary>ヒント1(考え方)</summary>

まず `RequestBase`(共通のフィールド)を作り、状態ごとに `RequestBase & { status: 'PENDING' }` のように**交差型**で足して、`|` でつなぐ。
`status` が判別子になり、`if (r.status === 'FAILED')` で絞り込める。

</details>

<details><summary>ヒント2(型の書き方)</summary>

```ts
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

interface RequestBase {
  readonly id: string; /* ... */
}

export type RepositoryRequest =
  | (RequestBase & { readonly status: 'PENDING' })
  | (RequestBase & { readonly status: 'PROCESSING'; readonly startedAt: string });
/* ... */
```

</details>

<details><summary>ヒント3(状態遷移)</summary>

`canTransition` は `ALLOWED_TRANSITIONS[from].includes(to)`。`isTerminal` は「遷移先が0個」。
`assertTransition` は `canTransition` が false のとき `throw new InvalidTransitionError(from, to)`。

</details>

## 9. 発展課題

1. `Extract<RepositoryRequest, { status: 'FAILED' }>` で FAILED の型を取り出す関数 `isFailed(r): r is FailedRequest`(型ガード)を書く
2. `RepositorySpec` から `Partial<Pick<RepositorySpec, 'description' | 'topics'>>` で「更新できる項目」の型を作る
3. ブランド型 `type RequestId = string & { readonly __brand: 'RequestId' }` を導入すると、何が防げる? 何が面倒になる?
4. `satisfies` を使って `ALLOWED_TRANSITIONS` の型を、推論を保ったまま検査する

## 10. 完了後に理解しておくべきこと

- 型は実行時には存在しない。だから、外部からの入力(JSON)は**型だけでは守れない**(課題04へ)
- 判別可能Unionで「ありえない状態」を作れなくする設計(型で不変条件を守る)
- `never` による網羅性チェックは、**将来 `status` を増やしたとき**に、直し忘れをコンパイラが教えてくれる
- `readonly` / `as const` の役割
