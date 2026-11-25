// 課題の進捗確認・受け入れテスト実行ツール。
//
//   npm run exercise                 全課題の進捗一覧(starter の実装を検査)
//   npm run exercise -- 03           課題03の受け入れテストを実行(詳細表示)
//   npm run exercise -- 03 --reference   完成形で受け入れテストを実行(テスト自体の確認)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(root, 'node_modules/vitest/vitest.mjs');

const EXERCISES = [
  { no: '01', title: 'TypeScriptの型(ドメインモデルと状態遷移)', kind: 'vitest' },
  { no: '02', title: 'ジェネリクス(Result / Page)', kind: 'vitest' },
  { no: '03', title: '非同期処理(タイムアウト・リトライ・並行制御)', kind: 'vitest' },
  { no: '04', title: '入力値検証(Zod・設定)', kind: 'vitest' },
  { no: '05', title: 'API設計(Fastify)', kind: 'vitest' },
  { no: '06', title: '依存性の注入(DI)とサービス層', kind: 'vitest' },
  { no: '07', title: 'テストを書く(ミューテーション検査)', kind: 'mutants' },
  { no: '08', title: 'エラーハンドリング(分類・リトライ・ログの秘匿)', kind: 'vitest' },
  { no: '09', title: 'データベース(SQLite)', kind: 'vitest' },
  { no: '10', title: '冪等性と障害からの復旧', kind: 'vitest' },
  { no: '11', title: 'セキュリティ演習(security-labs)', kind: 'labs' },
  { no: '12', title: 'CI/CD(GitHub Actions)', kind: 'ci' },
];

const args = process.argv.slice(2);
const target = args.includes('--reference') ? 'reference' : 'starter';
const wanted = args.find((a) => /^\d{1,2}$/.test(a))?.padStart(2, '0');

function runNode(script, scriptArgs, env = {}, stdio = 'inherit') {
  return spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: root,
    stdio,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function runExercise(ex) {
  console.log(`\n=== 課題${ex.no}: ${ex.title} (${target}) ===\n`);
  if (ex.kind === 'vitest') {
    const r = runNode(
      vitest,
      ['run', '--config', 'vitest.exercise.config.ts', `exercises/tests/ex${ex.no}-`],
      { TARGET: target },
    );
    return r.status ?? 1;
  }
  if (ex.kind === 'mutants') {
    return (
      runNode(
        join(root, 'scripts/check-mutants.mjs'),
        args.includes('--reference') ? ['--self-test'] : [],
      ).status ?? 1
    );
  }
  if (ex.kind === 'labs') {
    return runNode(join(root, 'scripts/lab.mjs'), ['status']).status ?? 1;
  }
  const dir = target === 'reference' ? '.github/workflows' : 'starter/ci';
  if (!existsSync(join(root, dir))) {
    console.log(
      `${dir}/ に GitHub Actions のワークフロー(.yml)を書いてください。docs/exercises/12-ci-cd.md を参照。`,
    );
    return 1;
  }
  return (
    runNode(join(root, 'scripts/check-workflows.mjs'), [
      dir,
      ...(target === 'starter' ? ['--require-quality-steps'] : []),
    ]).status ?? 1
  );
}

if (wanted) {
  const ex = EXERCISES.find((e) => e.no === wanted);
  if (!ex) {
    console.error(`課題 ${wanted} はありません。01〜12 を指定してください。`);
    process.exit(2);
  }
  process.exit(runExercise(ex));
}

// 進捗一覧
console.log(`受け入れテストの結果(${target} を検査)\n`);
const dir = mkdtempSync(join(tmpdir(), 'forge-ex-'));
const out = join(dir, 'result.json');
runNode(
  vitest,
  ['run', '--config', 'vitest.exercise.config.ts', '--reporter=json', `--outputFile=${out}`],
  { TARGET: target },
  'ignore',
);
const report = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { testResults: [] };
rmSync(dir, { recursive: true, force: true });

const stats = new Map();
for (const file of report.testResults) {
  const no = /ex(\d\d)-/.exec(file.name)?.[1];
  if (!no) continue;
  const s = stats.get(no) ?? { passed: 0, total: 0 };
  for (const t of file.assertionResults) {
    s.total += 1;
    if (t.status === 'passed') s.passed += 1;
  }
  stats.set(no, s);
}

for (const ex of EXERCISES) {
  const s = stats.get(ex.no);
  let mark;
  let detail;
  if (s) {
    mark = s.passed === s.total ? '✅' : s.passed === 0 || s.passed < s.total * 0.3 ? '⬜' : '🔶';
    detail = `${s.passed}/${s.total} テスト合格`;
  } else {
    mark = '➖';
    detail =
      ex.kind === 'mutants'
        ? '`npm run exercise -- 07` で検査'
        : ex.kind === 'labs'
          ? '`npm run exercise -- 11` で確認'
          : '`npm run exercise -- 12` で検査';
  }
  console.log(`${mark} 課題${ex.no}  ${ex.title.padEnd(40, '　')} ${detail}`);
}
console.log('\n詳細を見るには `npm run exercise -- <番号>` を実行してください。');
