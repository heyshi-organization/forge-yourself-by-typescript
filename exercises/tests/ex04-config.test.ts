import { describe, expect, it } from 'vitest';
import { FAKE_PAT } from '@test/helpers.js';
import { ConfigError, parseConfig } from '@app/schemas/config.js';

describe('parseConfig', () => {
  it('fake なら token 不要で、既定値が入る', () => {
    const c = parseConfig({ GITHUB_CLIENT: 'fake' });
    expect(c).toMatchObject({
      host: '127.0.0.1',
      port: 3000,
      githubClient: 'fake',
      githubTimeoutMs: 10_000,
      githubMaxAttempts: 4,
    });
  });

  it('octokit では GITHUB_TOKEN が必須(エラーに値は含まれない)', () => {
    expect(() => parseConfig({})).toThrow(ConfigError);
    expect(() => parseConfig({})).toThrow('GITHUB_TOKEN');
  });

  it('ループバック以外へのバインドは、明示しない限り拒否する', () => {
    const base = { GITHUB_CLIENT: 'fake' };
    expect(() => parseConfig({ ...base, HOST: '0.0.0.0' })).toThrow('ALLOW_PUBLIC_BIND');
    expect(parseConfig({ ...base, HOST: '0.0.0.0', ALLOW_PUBLIC_BIND: 'true' }).host).toBe(
      '0.0.0.0',
    );
    expect(parseConfig({ ...base, HOST: 'localhost' }).host).toBe('localhost');
  });

  it('数値は文字列から変換し、範囲外は拒否する', () => {
    const base = { GITHUB_CLIENT: 'fake' };
    expect(parseConfig({ ...base, PORT: '8080' }).port).toBe(8080);
    expect(() => parseConfig({ ...base, PORT: '70000' })).toThrow(ConfigError);
    expect(() => parseConfig({ ...base, PORT: 'abc' })).toThrow(ConfigError);
    expect(() => parseConfig({ ...base, GITHUB_MAX_ATTEMPTS: '0' })).toThrow(ConfigError);
  });

  it('設定エラーのメッセージにトークンの値が出ない', () => {
    const token = FAKE_PAT;
    try {
      parseConfig({ GITHUB_TOKEN: token, PORT: 'x' });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain(token);
    }
  });
});
