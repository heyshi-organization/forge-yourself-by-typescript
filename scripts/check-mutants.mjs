// 課題07: 学習者が書いたテストの「強さ」を検査する。
//
//   1. 完成形(reference)に対してテストが全部通ること(=テスト自体が正しい)
//   2. わざとバグを仕込んだ実装(ミュータント)に対して、テストが失敗すること(=バグを検出できる)
//
// 使い方:
//   node scripts/check-mutants.mjs                       starter/test/ex07-retry.test.ts を検査
//   node scripts/check-mutants.mjs --self-test           完成形のテスト(exercises/tests/ex03-retry.test.ts)で検査(CI用)
//   node scripts/check-mutants.mjs path/to/a.test.ts     指定のテストを検査
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const files = selfTest
  ? 'exercises/tests/ex03-retry.test.ts'
  : args.filter((a) => !a.startsWith('--')).join(',') || 'starter/test/ex07-retry.test.ts';

const spec = JSON.parse(readFileSync(join(root, 'exercises/mutants/retry.json'), 'utf8'));
const original = readFileSync(join(root, spec.target), 'utf8');
const workDir = join(root, '.lab-work', 'mutants');
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

function runVitest(mutantPath) {
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.mutation.config.ts',
      '--reporter=dot',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TEST_FILES: files, ...(mutantPath ? { MUTANT: mutantPath } : {}) },
    },
  );
  return { code: result.status ?? 1, output: `${result.stdout}\n${result.stderr}` };
}

console.log(`検査対象のテスト: ${files}\n`);

// 1. ベースライン
const base = runVitest(undefined);
if (base.code !== 0) {
  console.log(
    '❌ 完成形の実装に対して、あなたのテストが失敗しました。テスト自体が間違っている可能性があります。\n',
  );
  console.log(base.output.split('\n').slice(0, 60).join('\n'));
  process.exit(1);
}
console.log('✅ 完成形の実装では、テストが全部通ります\n');

// 2. ミュータント
let killed = 0;
const survived = [];
for (const m of spec.mutants) {
  if (!original.includes(m.find)) {
    console.error(
      `内部エラー: ミュータント ${m.name} の置換対象が retry.ts に見つかりません。exercises/mutants/retry.json を更新してください。`,
    );
    process.exit(2);
  }
  const mutated = original
    .replace(m.find, m.replace)
    .replace("from './sleep.js'", "from '@app/async/sleep.js'");
  const path = join(workDir, `${m.name}.ts`);
  writeFileSync(path, mutated);
  const r = runVitest(path);
  if (r.code !== 0) {
    killed += 1;
    console.log(`  ✅ 検出: ${m.name}`);
  } else {
    survived.push(m);
    console.log(`  ❌ 見逃し: ${m.name}`);
  }
}
rmSync(workDir, { recursive: true, force: true });

console.log(`\n結果: ${killed} / ${spec.mutants.length} 個のバグを検出しました`);
if (survived.length > 0) {
  console.log('\n見逃したバグ(ヒント):');
  for (const m of survived) console.log(`  - ${m.name}: ${m.hint}`);
  process.exit(1);
}
console.log('すべてのバグを検出できました。合格です!');
