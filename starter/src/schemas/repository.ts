import { z } from 'zod';
import './setup.js';
import { OWNER_TYPES, REQUEST_STATUSES, VISIBILITIES } from '../domain/request.js';
import type { RepositorySpec } from '../domain/request.js';
import { NotImplementedError } from '../shared/not-implemented.js';

// TODO(ex04): docs/exercises/04-validation.md の仕様に従ってスキーマを実装する。
export const repositoryNameSchema = z.string(); // TODO: 規則に沿った検証を追加
export const ownerSchema = z.string(); // TODO
export const topicSchema = z.string(); // TODO
export const createRepositoryBodySchema = z.object({}); // TODO: 全フィールドを定義し strict() にする
// TODO: スキーマから z.infer で型を導出する(下の any を置き換える)
export type CreateRepositoryBody = any;
export function toRepositorySpec(_body: CreateRepositoryBody): RepositorySpec {
  throw new NotImplementedError('04');
}
export const idempotencyKeySchema = z.string(); // TODO
export const listQuerySchema = z.object({}); // TODO: limit / offset / status
export type ListQuery = any;
export const requestIdParamSchema = z.object({ id: z.string() });
