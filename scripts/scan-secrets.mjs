// リポジトリ内の秘密情報・個人情報の混入を検査する簡易スキャナ(GitHub Secret Scanning の補助)。
// 追跡対象(git が管理するファイル + .gitignore されていない新規ファイル)を調べる。誤検知は、行末に `scan-secrets:allow` を書くと除外できる。
//
//   node scripts/scan-secrets.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RULES = [
  { name: 'GitHubトークン', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { name: 'AWSアクセスキーID', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: '秘密鍵', re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/ },
  { name: 'Slackトークン', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    name: '秘密っぽい名前への長い文字列の代入',
    re: /\b\w*(password|passwd|secret|api[_-]?key|token|private[_-]?key)\w*\s*[:=]\s*['"`]([^'"`\s]{12,})['"`]/i,
    // 演習用ダミー・プレースホルダーは除外
    ignoreValue: /^(lab-dummy-|<|\$\{|process\.env|dummy|example|changeme|your-)/i,
  },
  {
    name: '個人のメールアドレス',
    re: /[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com|example\.(com|org)|anthropic\.com)[A-Za-z0-9-]+\.[A-Za-z]{2,}/,
    ignoreLine:
      /(https?:\/\/[^\s]*@|noreply|@types\/|@octokit|@eslint|@vitest|@fastify|@app\/|@test\/|@\w+\/\w+|npm@|\w+@\d)/,
  },
  {
    name: 'ローカルの絶対パス(ユーザー名を含む)',
    re: /\/(Users|home)\/(?!runner\b|user\b|\w*example)[A-Za-z0-9._-]+\//,
  },
];

// 検査から除く: ロックファイル(ハッシュが多い)、この検査ツール自身
const SKIP = [
  /^package-lock\.json$/,
  /^scripts\/scan-secrets\.mjs$/,
  /^scripts\/test\/scan-secrets\.test\.ts$/,
];

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter((f) => f && !SKIP.some((re) => re.test(f)));

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // 削除済みなど
  }
  if (text.includes('\0')) continue; // バイナリ
  text.split('\n').forEach((line, i) => {
    if (line.includes('scan-secrets:allow')) return;
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (!m) continue;
      if (rule.ignoreLine?.test(line)) continue;
      if (rule.ignoreValue && m[2] && rule.ignoreValue.test(m[2])) continue;
      findings.push(`${file}:${i + 1}  [${rule.name}]`);
    }
  });
}

if (findings.length > 0) {
  console.error(
    `秘密情報・個人情報の可能性がある箇所が ${findings.length} 件あります(値は表示しません):\n`,
  );
  for (const f of findings) console.error(`  ✗ ${f}`);
  console.error(
    '\n本物なら、コミット履歴からの削除ではなく「まず無効化(ローテーション)」してください。誤検知なら行末に scan-secrets:allow を付けます。',
  );
  process.exit(1);
}
console.log(
  `✅ ${files.length} ファイルを検査しました。秘密情報・個人情報らしきものは見つかりませんでした。`,
);
