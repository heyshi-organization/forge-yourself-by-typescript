import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = new URL('../scan-secrets.mjs', import.meta.url).pathname;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'scan-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function scan(content: string) {
  writeFileSync(join(dir, 'file.ts'), content);
  const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// 実在しないダミー値。リポジトリ内にトークン形式のリテラルを残さないよう実行時に組み立てる
const fakePat = ['ghp', 'x'.repeat(36)].join('_');
const fakeAws = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const homePath = ['', 'Users', 'someone', 'work'].join('/');

describe('scan-secrets', () => {
  it('普通のコードは合格', () => {
    expect(scan('export const a = 1;\n// noreply@users.noreply.github.com\n').code).toBe(0);
  });

  it.each([
    ['GitHubトークン', `const t = '${fakePat}';`],
    ['AWSキー', `const k = '${fakeAws}';`],
    ['秘密鍵', '-----BEGIN RSA PRIVATE KEY-----'],
    ['長い値の代入', "const apiKey = 'abcdefghijklmnop12345';"],
    ['個人のメールアドレス', '// contact: someone@gmail.com'],
    ['ローカルの絶対パス', `// ${homePath}`],
  ])('%s を検出する(値は出力しない)', (_label, content) => {
    const r = scan(content);
    expect(r.code).toBe(1);
    expect(r.out).toContain('file.ts:1');
    expect(r.out).not.toContain('abcdefghijklmnop12345');
    expect(r.out).not.toContain(fakePat);
  });

  it('scan-secrets:allow を付けた行は除外できる', () => {
    expect(scan("const apiKey = 'abcdefghijklmnop12345'; // scan-secrets:allow").code).toBe(0);
  });

  it('プレースホルダー・環境変数参照は誤検知しない', () => {
    expect(
      scan("const token = 'your-token-here-please';\nconst password = process.env.PW;").code,
    ).toBe(0);
  });
});
