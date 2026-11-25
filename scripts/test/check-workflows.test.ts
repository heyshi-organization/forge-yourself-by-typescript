import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = new URL('../check-workflows.mjs', import.meta.url).pathname;
const SHA = 'a'.repeat(40);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wf-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function check(yaml: string, flags: string[] = []) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'w.yml'), yaml);
  const r = spawnSync(process.execPath, [script, dir, ...flags], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const good = `
name: ok
on: [pull_request]
permissions: {}
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@${SHA} # v1
        with:
          persist-credentials: false
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm test
      - run: npm audit
`;

describe('check-workflows', () => {
  it('約束事を守ったワークフローは合格', () => {
    expect(check(good).code).toBe(0);
  });

  it('--require-quality-steps: 品質ステップが揃っていれば合格、欠けていれば不合格', () => {
    expect(check(good, ['--require-quality-steps']).code).toBe(0);
    const r = check(good.replace('      - run: npm audit\n', ''), ['--require-quality-steps']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('npm audit');
  });

  it.each([
    ['permissions が無い', good.replace('permissions: {}\n', ''), 'permissions'],
    [
      'トップレベルに write',
      good.replace('permissions: {}', 'permissions:\n  contents: write'),
      'permissions',
    ],
    ['write-all', good.replace('permissions: {}', 'permissions: write-all'), 'permissions'],
    ['タグ指定の Action', good.replace(`@${SHA} # v1`, '@v4'), 'pinned-actions'],
    ['ブランチ指定の Action', good.replace(`@${SHA} # v1`, '@main'), 'pinned-actions'],
    ['SHA 指定なしの Action', good.replace(`@${SHA} # v1`, ''), 'pinned-actions'],
    [
      'pull_request_target',
      good.replace('[pull_request]', '[pull_request_target]'),
      'dangerous-trigger',
    ],
    ['workflow_run', good.replace('[pull_request]', '[workflow_run]'), 'dangerous-trigger'],
    [
      'head_ref の直接埋め込み',
      good.replace('npm ci', 'echo ${{ github.head_ref }}'),
      'script-injection',
    ],
    [
      'PRタイトルの直接埋め込み',
      good.replace('npm ci', 'echo "${{ github.event.pull_request.title }}"'),
      'script-injection',
    ],
    [
      'secrets の直接埋め込み',
      good.replace('npm ci', 'echo ${{ secrets.TOKEN }}'),
      'script-injection',
    ],
    [
      'persist-credentials 未指定',
      good.replace('        with:\n          persist-credentials: false\n', ''),
      'checkout',
    ],
    ['timeout なし', good.replace('    timeout-minutes: 5\n', ''), 'timeout'],
    ['self-hosted ランナー', good.replace('ubuntu-24.04', '[self-hosted, linux]'), 'runner'],
  ])('%s は不合格', (_label, yaml, rule) => {
    const r = check(yaml);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`[${rule}]`);
  });

  it('env 経由で渡す書き方は合格(安全な方法)', () => {
    const yaml = good.replace(
      '      - run: npm ci',
      '      - env:\n          REF: ${{ github.head_ref }}\n        run: echo "$REF"\n      - run: npm ci',
    );
    expect(check(yaml).code).toBe(0);
  });

  it('ローカル Action(./)は SHA 固定を要求しない', () => {
    const yaml = good.replace(
      '      - run: npm ci',
      '      - uses: ./.github/actions/setup\n      - run: npm ci',
    );
    expect(check(yaml).code).toBe(0);
  });

  it('壊れた YAML や jobs の無いファイルは不合格', () => {
    expect(check('a: [').code).toBe(1);
    expect(check('name: x\non: push\n').code).toBe(1);
  });

  it('ディレクトリが無い・空のときは不合格', () => {
    const r = spawnSync(process.execPath, [script, join(dir, 'nothing')], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('このリポジトリの .github/workflows が約束事を満たしている', () => {
    const repoWorkflows = new URL('../../.github/workflows', import.meta.url).pathname;
    const r = spawnSync(process.execPath, [script, repoWorkflows], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
