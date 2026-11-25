import { z } from 'zod';
import './setup.js';
import { OWNER_TYPES, REQUEST_STATUSES, VISIBILITIES } from '../domain/request.js';
import type { RepositorySpec } from '../domain/request.js';

// @starter-begin ex04
/**
 * GitHubのリポジトリ名の規則(英数字・ . _ -、100文字以内)に、安全のための制約を加えたもの。
 * - "." と ".." は拒否(パストラバーサルの足がかりになる)
 * - ".git" で終わる名前はGitHubが拒否する
 */
export const repositoryNameSchema = z
  .string()
  .min(1, '1文字以上で指定してください')
  .max(100, '100文字以内で指定してください')
  .regex(/^[A-Za-z0-9._-]+$/, '使えるのは英数字・ . _ - のみです')
  .refine((v) => v !== '.' && v !== '..', '"." と ".." は使えません')
  .refine((v) => !v.toLowerCase().endsWith('.git'), '".git" で終わる名前は使えません');

/** GitHubのユーザー名/Organization名: 英数字とハイフン、39文字以内、先頭末尾はハイフン不可、連続ハイフン不可。 */
export const ownerSchema = z
  .string()
  .min(1)
  .max(39)
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/,
    '英数字とハイフンのみ。先頭・末尾にハイフンは使えません',
  )
  .refine((v) => !v.includes('--'), '連続したハイフンは使えません');

export const topicSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,49}$/, 'topicは小文字英数字とハイフン、50文字以内です');

/** 制御文字(改行を含む)を禁止する。ログ・ヘッダへの混入防止。 */
// eslint-disable-next-line no-control-regex -- 制御文字を検出するのが目的
const noControlChars = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);

/**
 * POST /v1/repository-requests のボディ。
 * strict() で想定外のフィールドを拒否する(Mass Assignment対策)。
 */
export const createRepositoryBodySchema = z
  .object({
    owner: ownerSchema,
    ownerType: z.enum(OWNER_TYPES),
    name: repositoryNameSchema,
    description: z
      .string()
      .max(350, '350文字以内で指定してください')
      .refine(noControlChars, '制御文字は使えません')
      .optional(),
    visibility: z.enum(VISIBILITIES),
    autoInit: z.boolean().default(false),
    topics: z
      .array(topicSchema)
      .max(20, 'topicsは20個までです')
      .refine((arr) => new Set(arr).size === arr.length, 'topicsに重複があります')
      .default([]),
  })
  .strict();

/** スキーマから型を導出する。型定義と実行時検証が二重管理にならない。 */
export type CreateRepositoryBody = z.infer<typeof createRepositoryBodySchema>;

/** 検証済みの入力を、ドメインの RepositorySpec に変換する。 */
export function toRepositorySpec(body: CreateRepositoryBody): RepositorySpec {
  return {
    owner: body.owner,
    ownerType: body.ownerType,
    name: body.name,
    description: body.description ?? null,
    visibility: body.visibility,
    autoInit: body.autoInit,
    topics: body.topics,
  };
}

/** Idempotency-Key ヘッダ。UUIDも許容できるよう英数字・ - _ のみ、8〜128文字。 */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, '8〜128文字の英数字・ - _ のみ使えます');

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.enum(REQUEST_STATUSES).optional(),
  })
  .strict();

export type ListQuery = z.infer<typeof listQuerySchema>;

export const requestIdParamSchema = z.object({ id: z.string().min(1).max(64) }).strict();
// @starter-else
//| // TODO(ex04): docs/exercises/04-validation.md の仕様に従ってスキーマを実装する。
//| export const repositoryNameSchema = z.string(); // TODO: 規則に沿った検証を追加
//| export const ownerSchema = z.string(); // TODO
//| export const topicSchema = z.string(); // TODO
//| export const createRepositoryBodySchema = z.object({}); // TODO: 全フィールドを定義し strict() にする
//| // TODO: スキーマから z.infer で型を導出する(下の any を置き換える)
//| export type CreateRepositoryBody = any;
//| export function toRepositorySpec(_body: CreateRepositoryBody): RepositorySpec {
//|   throw new NotImplementedError('04');
//| }
//| export const idempotencyKeySchema = z.string(); // TODO
//| export const listQuerySchema = z.object({}); // TODO: limit / offset / status
//| export type ListQuery = any;
//| export const requestIdParamSchema = z.object({ id: z.string() });
// @starter-end
