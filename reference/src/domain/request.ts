/**
 * ドメインモデル: リポジトリ作成要求(Provisioning Request)。
 * ここは外部ライブラリに依存しない純粋な型定義。
 */

export const REQUEST_STATUSES = ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'] as const;
export const VISIBILITIES = ['public', 'private'] as const;
export const OWNER_TYPES = ['user', 'organization'] as const;

// @starter-begin ex01
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type OwnerType = (typeof OWNER_TYPES)[number];

/** GitHubに作ってほしいリポジトリの仕様(入力値検証済み)。 */
export interface RepositorySpec {
  readonly owner: string;
  readonly ownerType: OwnerType;
  readonly name: string;
  readonly description: string | null;
  readonly visibility: Visibility;
  readonly autoInit: boolean;
  readonly topics: readonly string[];
}

/** GitHub上に作成されたリポジトリの情報。 */
export interface GitHubRepositoryInfo {
  readonly id: number;
  readonly fullName: string;
  readonly htmlUrl: string;
  /** GitHubが記録した作成日時(ISO 8601)。 */
  readonly createdAt: string;
}

/** 利用者に見せてよいエラー情報(内部の詳細は含めない)。 */
export interface RequestError {
  readonly code: string;
  readonly message: string;
}

interface RequestBase {
  readonly id: string;
  readonly idempotencyKey: string;
  /** specのSHA-256。同じIdempotency-Keyで内容が違う要求を検出するために使う。 */
  readonly requestHash: string;
  readonly spec: RepositorySpec;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 状態ごとに「持っているはずのフィールド」が変わるので、判別可能なUnion型で表す。
 * status を絞り込む(narrowing)と、対応するフィールドが型安全に使える。
 */
export type RepositoryRequest =
  | (RequestBase & { readonly status: 'PENDING' })
  | (RequestBase & { readonly status: 'PROCESSING'; readonly startedAt: string })
  | (RequestBase & {
      readonly status: 'SUCCEEDED';
      readonly startedAt: string;
      readonly finishedAt: string;
      readonly repository: GitHubRepositoryInfo;
      /** 例: topicsの設定に失敗したが、リポジトリ自体は作成済み。 */
      readonly warnings: readonly string[];
    })
  | (RequestBase & {
      readonly status: 'FAILED';
      readonly startedAt: string;
      readonly finishedAt: string;
      readonly error: RequestError;
    });
// @starter-else
//| // TODO(ex01): docs/exercises/01-typescript-types.md の仕様に従って型を定義する。
//| // 下の any は「まだ型を書いていない」ことを示す暫定の目印。定義したら any を消すこと。
//| export type RequestStatus = any;
//| export type Visibility = any;
//| export type OwnerType = any;
//| export type RepositorySpec = any;
//| export type GitHubRepositoryInfo = any;
//| export type RequestError = any;
//| export type RepositoryRequest = any;
// @starter-end
