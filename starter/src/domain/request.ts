/**
 * ドメインモデル: リポジトリ作成要求(Provisioning Request)。
 * ここは外部ライブラリに依存しない純粋な型定義。
 */

export const REQUEST_STATUSES = ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'] as const;
export const VISIBILITIES = ['public', 'private'] as const;
export const OWNER_TYPES = ['user', 'organization'] as const;

// TODO(ex01): docs/exercises/01-typescript-types.md の仕様に従って型を定義する。
// 下の any は「まだ型を書いていない」ことを示す暫定の目印。定義したら any を消すこと。
export type RequestStatus = any;
export type Visibility = any;
export type OwnerType = any;
export type RepositorySpec = any;
export type GitHubRepositoryInfo = any;
export type RequestError = any;
export type RepositoryRequest = any;
