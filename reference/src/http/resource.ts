import type { RepositoryRequest } from '../domain/request.js';
import { assertNever } from '../domain/state-machine.js';

/** APIが返すJSONの形。内部の型(RepositoryRequest)とは分けて、公開してよい項目だけを出す。 */
export interface RequestResource {
  id: string;
  status: RepositoryRequest['status'];
  spec: {
    owner: string;
    ownerType: string;
    name: string;
    description: string | null;
    visibility: string;
    autoInit: boolean;
    topics: readonly string[];
  };
  repository: { id: number; fullName: string; htmlUrl: string } | null;
  warnings: readonly string[];
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export function toRequestResource(request: RepositoryRequest): RequestResource {
  const common = {
    id: request.id,
    status: request.status,
    spec: {
      owner: request.spec.owner,
      ownerType: request.spec.ownerType,
      name: request.spec.name,
      description: request.spec.description,
      visibility: request.spec.visibility,
      autoInit: request.spec.autoInit,
      topics: request.spec.topics,
    },
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
  switch (request.status) {
    case 'PENDING':
      return {
        ...common,
        repository: null,
        warnings: [],
        error: null,
        startedAt: null,
        finishedAt: null,
      };
    case 'PROCESSING':
      return {
        ...common,
        repository: null,
        warnings: [],
        error: null,
        startedAt: request.startedAt,
        finishedAt: null,
      };
    case 'SUCCEEDED':
      return {
        ...common,
        repository: {
          id: request.repository.id,
          fullName: request.repository.fullName,
          htmlUrl: request.repository.htmlUrl,
        },
        warnings: request.warnings,
        error: null,
        startedAt: request.startedAt,
        finishedAt: request.finishedAt,
      };
    case 'FAILED':
      return {
        ...common,
        repository: null,
        warnings: [],
        error: { code: request.error.code, message: request.error.message },
        startedAt: request.startedAt,
        finishedAt: request.finishedAt,
      };
    default:
      return assertNever(request);
  }
}
