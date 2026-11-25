import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REDACTED, redactSecrets, redactString } from '@app/logging/redact.js';
import { FAKE_FINE_GRAINED, FAKE_PAT, captureLogs } from '../helpers.js';

// テスト用のダミー。実在のトークンではない(形式だけ似せている)

describe('redactString', () => {
  it('GitHubトークンを隠す', () => {
    expect(redactString(`token is ${FAKE_PAT}!`)).toBe(`token is ${REDACTED}!`);
    expect(redactString(FAKE_FINE_GRAINED)).toBe(REDACTED);
  });
  it('Authorization ヘッダ風の文字列を隠す', () => {
    expect(redactString('Authorization: Bearer abcdefgh12345678')).not.toContain(
      'abcdefgh12345678',
    );
  });
  it('URL内の認証情報を隠す', () => {
    const out = redactString('https://user:pa55w0rd@example.com/x');
    expect(out).not.toContain('pa55w0rd');
    expect(out).toContain('example.com');
  });
  it('普通の文字列は変えない', () => {
    expect(redactString('repository created: acme/demo')).toBe('repository created: acme/demo');
  });
});

describe('redactSecrets', () => {
  it('キー名が秘密っぽければ値ごと隠す', () => {
    expect(
      redactSecrets({
        githubToken: 'x',
        password: 'y',
        headers: { authorization: 'z', accept: 'json' },
        apiKey: 'k',
      }),
    ).toEqual({
      githubToken: REDACTED,
      password: REDACTED,
      headers: { authorization: REDACTED, accept: 'json' },
      apiKey: REDACTED,
    });
  });
  it('入れ子・配列の中の値も隠す', () => {
    expect(redactSecrets({ a: [{ msg: `x ${FAKE_PAT}` }] })).toEqual({
      a: [{ msg: `x ${REDACTED}` }],
    });
  });
  it('Error は message / stack / cause まで隠す', () => {
    const e = new Error(`failed with ${FAKE_PAT}`, {
      cause: new Error(`inner ${FAKE_FINE_GRAINED}`),
    });
    const out = JSON.stringify(redactSecrets(e));
    expect(out).not.toContain(FAKE_PAT);
    expect(out).not.toContain(FAKE_FINE_GRAINED);
    expect(out).toContain('failed with');
  });
  it('元のオブジェクトを変更しない', () => {
    const input = { token: 'secret', n: 1 };
    redactSecrets(input);
    expect(input).toEqual({ token: 'secret', n: 1 });
  });
  it('循環参照でも無限ループしない', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(redactSecrets(a)).toEqual({ name: 'a', self: '[CIRCULAR]' });
  });
  it('深すぎる入れ子は打ち切る', () => {
    let deep: Record<string, unknown> = { leaf: FAKE_PAT };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(JSON.stringify(redactSecrets(deep))).not.toContain(FAKE_PAT);
  });
  it('プリミティブはそのまま', () => {
    expect(redactSecrets(1)).toBe(1);
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
  });
  it('property: どんな位置・形に埋め込まれても、トークンは出力に残らない', () => {
    const wrap = fc.oneof(
      fc.constant((s: string) => s),
      fc.constant((s: string) => ({ any: s })),
      fc.constant((s: string) => [s, { deep: [s] }]),
      fc.constant((s: string) => new Error(s)),
    );
    fc.assert(
      fc.property(
        wrap,
        fc.string({ maxLength: 10 }),
        fc.string({ maxLength: 10 }),
        (w, pre, post) => {
          const out = JSON.stringify(redactSecrets(w(`${pre} ${FAKE_PAT} ${post}`)));
          expect(out).not.toContain(FAKE_PAT);
        },
      ),
    );
  });
});

describe('createLogger(統合)', () => {
  it('ログ出力にトークンが残らない(オブジェクト・メッセージ・Error)', () => {
    const { logger, raw } = captureLogs();
    logger.info({ token: FAKE_PAT, nested: { text: FAKE_PAT } }, `msg ${FAKE_PAT}`);
    logger.error({ err: new Error(`boom ${FAKE_PAT}`) }, 'failed');
    expect(raw()).not.toContain(FAKE_PAT);
    expect(raw()).toContain('boom');
  });
});
