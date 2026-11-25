// セキュリティ演習(security-labs)の操作ツール。
//
//   npm run lab:start -- <演習ID>   exercise/sec-<演習ID> ブランチを作り、脆弱なコードを lab-workspace/ に展開する
//   node scripts/lab.mjs status     全演習の状況
//   node scripts/lab.mjs test <ID>  展開した演習のテストを実行
//   npm run lab:verify              演習自体の健全性を検証する(脆弱版は攻撃テストが失敗 / 修正版は全部成功)
//
// 脆弱なコードは security-labs/ に `.txt` として置いてあり、main ブランチでは実行・ビルド・解析の対象にならない。
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const labsDir = join(root, 'security-labs');
const vitest = join(root, 'node_modules/vitest/vitest.mjs');

const labIds = () =>
  readdirSync(labsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d\d-/.test(d.name))
    .map((d) => d.name)
    .sort();

function resolveLab(arg) {
  const ids = labIds();
  const id = ids.find(
    (i) => i === arg || i.startsWith(`${arg}-`) || i.startsWith(arg.padStart(2, '0') + '-'),
  );
  if (!id) {
    console.error(`演習 "${arg ?? ''}" は見つかりません。候補:\n  ${ids.join('\n  ')}`);
    process.exit(2);
  }
  return id;
}

/** variant('vulnerable' | 'solution') の app.ts と security.test.ts を dest に展開する */
function materialize(id, variant, dest) {
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(labsDir, id, variant, 'app.ts.txt'), join(dest, 'app.ts'));
  copyFileSync(join(labsDir, id, 'security.test.ts.txt'), join(dest, 'security.test.ts'));
}

function runTests(testFile, reporterArgs = []) {
  return spawnSync(
    process.execPath,
    [vitest, 'run', '--config', 'vitest.lab.config.ts', ...reporterArgs],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TEST_FILES: testFile },
    },
  );
}

function runJson(testFile) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-lab-'));
  const out = join(dir, 'r.json');
  const r = runTests(testFile, ['--reporter=json', `--outputFile=${out}`]);
  const report = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status ?? 1, report, stderr: r.stderr };
}

const [command, arg, ...rest] = process.argv.slice(2);

if (command === 'start') {
  const id = resolveLab(arg);
  const branch = `exercise/sec-${id}`;
  if (!rest.includes('--no-branch')) {
    const sw = spawnSync('git', ['switch', '-c', branch], { cwd: root, stdio: 'inherit' });
    if (sw.status !== 0) {
      console.error(
        `\nブランチ ${branch} を作れませんでした(すでに存在する場合は \`git switch ${branch}\` で移動してください)。`,
      );
      process.exit(1);
    }
  }
  const dest = join(root, 'lab-workspace', id);
  materialize(id, 'vulnerable', dest);
  console.log(`\n演習 ${id} を lab-workspace/${id}/ に展開しました。`);
  console.log(`  1. security-labs/${id}/README.md を読む`);
  console.log(`  2. npm run lab:test -- ${id}   でテストが失敗する(=脆弱性がある)ことを確認する`);
  console.log(`  3. lab-workspace/${id}/app.ts を修正して、テストを全部通す`);
  console.log(`  4. コミットして push し、**ドラフトPR**を作って CodeQL の結果を見る`);
  console.log(
    '     ⚠️ exercise/* ブランチは main にマージしてはいけません(CIが意図的に失敗します)',
  );
} else if (command === 'test') {
  const id = resolveLab(arg);
  const file = `lab-workspace/${id}/security.test.ts`;
  if (!existsSync(join(root, file))) {
    console.error(`${file} がありません。先に \`npm run lab:start -- ${id}\` を実行してください。`);
    process.exit(1);
  }
  process.exit(runTests(file, ['--reporter=default']).status ?? 1);
} else if (command === 'status' || command === undefined) {
  console.log('セキュリティ演習の状況\n');
  for (const id of labIds()) {
    const file = `lab-workspace/${id}/security.test.ts`;
    if (!existsSync(join(root, file))) {
      console.log(`⬜ ${id}  未着手(\`npm run lab:start -- ${id}\`)`);
      continue;
    }
    const { code } = runJson(file);
    console.log(
      `${code === 0 ? '✅' : '🔶'} ${id}  ${code === 0 ? 'テスト合格' : '修正中(テストが失敗しています)'}`,
    );
  }
} else if (command === 'verify') {
  const work = join(root, '.lab-work', 'labs');
  rmSync(work, { recursive: true, force: true });
  let failed = 0;
  for (const id of labIds()) {
    // 脆弱版: 「正常な利用」は通り、それ以外(攻撃を防ぐテスト)が1つ以上失敗すること
    materialize(id, 'vulnerable', join(work, id, 'vulnerable'));
    const vuln = runJson(`.lab-work/labs/${id}/vulnerable/security.test.ts`);
    const results = vuln.report?.testResults.flatMap((f) => f.assertionResults) ?? [];
    const normal = results.filter((t) => t.ancestorTitles.some((a) => a.includes('正常な利用')));
    const security = results.filter((t) => !t.ancestorTitles.some((a) => a.includes('正常な利用')));
    const vulnOk =
      results.length > 0 &&
      normal.length > 0 &&
      normal.every((t) => t.status === 'passed') &&
      security.some((t) => t.status === 'failed');

    // 修正版: すべて通ること
    materialize(id, 'solution', join(work, id, 'solution'));
    const fixed = runJson(`.lab-work/labs/${id}/solution/security.test.ts`);
    const fixedOk = fixed.code === 0;

    const failedSecurity = security.filter((t) => t.status === 'failed').length;
    console.log(
      `${vulnOk && fixedOk ? '✅' : '❌'} ${id}  脆弱版: ${vulnOk ? `正常系は成功・攻撃テスト ${failedSecurity}/${security.length} 件が失敗(期待どおり)` : '期待と異なる'}  /  修正版: ${fixedOk ? '全テスト成功' : '失敗あり'}`,
    );
    if (!(vulnOk && fixedOk)) failed += 1;
  }
  rmSync(work, { recursive: true, force: true });
  if (failed > 0) process.exit(1);
  console.log(`\n${labIds().length} 件の演習すべてが健全です。`);
} else {
  console.error('使い方: lab.mjs <start|test|status|verify> [演習ID]');
  process.exit(2);
}
