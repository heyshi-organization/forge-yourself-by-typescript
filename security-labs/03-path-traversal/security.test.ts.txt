import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildLabApp } from './app.js';

let base: string;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'lab-path-'));
  mkdirSync(join(base, 'templates'));
  writeFileSync(join(base, 'templates', 'ok.txt'), 'template-content');
  writeFileSync(join(base, 'secret.txt'), 'TOP-SECRET'); // templates の外にある秘密
  symlinkSync(join(base, 'secret.txt'), join(base, 'templates', 'link.txt'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const get = async (name: string) => {
  const app = buildLabApp(base);
  const res = await app.inject({ method: 'GET', url: '/templates', query: { name } });
  await app.close();
  return res;
};

describe('正常な利用', () => {
  it('テンプレートを読める', async () => {
    const res = await get('ok.txt');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ content: string }>().content).toBe('template-content');
  });
});

describe('パストラバーサル(攻撃は防がれなければならない)', () => {
  it.each([
    ['親ディレクトリ', '../secret.txt'],
    ['多段', 'a/../../secret.txt'],
    ['絶対パス', join(tmpdir(), 'x', '..', 'etc', 'passwd')],
    ['絶対パス(秘密)', '/etc/passwd'],
    ['NULL文字', 'ok.txt\u0000../secret.txt'],
    ['Windows区切り', '..\\secret.txt'],
  ])('%s で templates の外を読めてはいけない', async (_label, name) => {
    const res = await get(name);
    expect(res.body).not.toContain('TOP-SECRET');
    expect(res.body).not.toContain('root:');
  });

  it('(発展)シンボリックリンク経由で外のファイルを読めてはいけない', async () => {
    const res = await get('link.txt');
    expect(res.body).not.toContain('TOP-SECRET');
  });
});
