/**
 * 実際の GitHub API を呼ぶテスト(ライブテスト)。通常の `npm test` には含まれない。
 *
 * 実行するには、次をすべて満たすこと(1つでも欠けると全テストがスキップされ、何も作成されない):
 *   RUN_LIVE_GITHUB_TESTS=1         明示的な実行の意思表示
 *   GITHUB_TOKEN=...                テスト専用の fine-grained PAT(対象Ownerのリポジトリ作成権限のみ。削除権限があると後片付けまで自動化できる)
 *   LIVE_GITHUB_OWNER=...           リポジトリを作る専用のOwner(テスト用アカウント/Organization。本番用は使わない)
 *   LIVE_GITHUB_OWNER_TYPE=user|organization
 *   LIVE_GITHUB_CONFIRM=...         LIVE_GITHUB_OWNER と同じ値(打ち間違い・環境変数の取り違え防止)
 *
 * 作成するリポジトリは必ず private で、名前は "forge-live-test-" で始まる。
 * 詳しくは docs/testing-strategy.md の「ライブテスト」を参照。
 */
/* eslint-disable no-console -- 実行者に後片付けの結果を知らせるための出力 */
import { Octokit } from '@octokit/rest';
import { afterAll, describe, expect, it } from 'vitest';
import { GitHubApiError } from '@app/github/errors.js';
import { OctokitGitHubClient } from '@app/github/octokit-client.js';
import type { RepositorySpec } from '@app/domain/request.js';

const env = process.env;
const PREFIX = 'forge-live-test-';

const enabled =
  env.RUN_LIVE_GITHUB_TESTS === '1' &&
  !!env.GITHUB_TOKEN &&
  !!env.LIVE_GITHUB_OWNER &&
  (env.LIVE_GITHUB_OWNER_TYPE === 'user' || env.LIVE_GITHUB_OWNER_TYPE === 'organization') &&
  env.LIVE_GITHUB_CONFIRM === env.LIVE_GITHUB_OWNER;

describe.skipIf(!enabled)('GitHub API(実通信)', () => {
  const owner = env.LIVE_GITHUB_OWNER as string;
  const ownerType = env.LIVE_GITHUB_OWNER_TYPE as 'user' | 'organization';
  const token = env.GITHUB_TOKEN as string;
  const client = new OctokitGitHubClient({ token });
  const name = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const spec: RepositorySpec = {
    owner,
    ownerType,
    name,
    description: 'forge-yourself-by-typescript のライブテストで作成(削除してよい)',
    visibility: 'private', // 常に private
    autoInit: false,
    topics: ['forge-live-test'],
  };

  afterAll(async () => {
    // 後片付け。トークンに delete_repo 権限が無ければ失敗するので、その場合は手動で削除してもらう
    try {
      await new Octokit({ auth: token }).rest.repos.delete({ owner, repo: name });
      console.warn(`[live] 後片付け: ${owner}/${name} を削除しました`);
    } catch {
      console.warn(
        `[live] ⚠️ ${owner}/${name} を自動削除できませんでした。GitHubの Settings から手動で削除してください。`,
      );
    }
  });

  it('認証ユーザーを取得できる', async () => {
    expect(await client.getAuthenticatedLogin()).toBeTypeOf('string');
  });

  it('リポジトリを作成し、取得し、topics を設定できる', async () => {
    const created = await client.createRepository(spec);
    expect(created.fullName.toLowerCase()).toBe(`${owner}/${name}`.toLowerCase());
    expect(created.htmlUrl).toContain(name);

    const found = await client.getRepository(owner, name);
    expect(found?.id).toBe(created.id);

    await client.replaceTopics(owner, name, spec.topics);
  });

  it('同名のリポジトリを再度作ると conflict(名前の重複)になる', async () => {
    const error = await client.createRepository(spec).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).kind).toBe('conflict');
  });

  it('存在しないリポジトリの取得は null', async () => {
    expect(await client.getRepository(owner, `${PREFIX}does-not-exist-${Date.now()}`)).toBeNull();
  });

  it('不正なトークンは auth エラーに分類される', async () => {
    const bad = new OctokitGitHubClient({ token: 'invalid-token-for-live-test' }); // scan-secrets:allow(意図的な無効値)
    const error = await bad.getAuthenticatedLogin().catch((e: unknown) => e);
    expect((error as GitHubApiError).kind).toBe('auth');
  });
});

describe.skipIf(enabled)('GitHub API(実通信)— スキップ', () => {
  it('実行条件が揃っていないため、ライブテストをスキップした(何も作成していない)', () => {
    expect(enabled).toBe(false);
  });
});
