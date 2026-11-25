// GitHub Actions のワークフローを静的に検査する(セキュリティ・運用の約束事を機械的に守るためのツール)。
//
//   node scripts/check-workflows.mjs [ディレクトリ] [--require-quality-steps]
//
// 検査する内容:
//   permissions       トップレベルで permissions を明示し、write を含めない(書き込みは job 単位で最小限に)
//   pinned-actions    外部 Action は 40 桁のコミットSHAで固定する(タグは付け替えられるため)
//   dangerous-trigger pull_request_target / workflow_run を使わない(fork の信頼できないコードに特権を渡さない)
//   script-injection  run: に github.event.* などの外部入力や secrets を直接埋め込まない(env 経由にする)
//   checkout          actions/checkout は persist-credentials: false にする
//   timeout           すべての job に timeout-minutes を付ける
//   runner            public リポジトリで self-hosted ランナーを使わない
//   quality-steps     (--require-quality-steps)  npm ci / lint / format / 型検査 / テスト / audit を含む
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? '.github/workflows');
const requireQuality = args.includes('--require-quality-steps');

const SHA = /^[0-9a-f]{40}$/;
const UNTRUSTED =
  /\$\{\{[^}]*\b(github\.event\.|github\.head_ref|github\.event_name\s*==\s*'[^']*'\s*&&\s*github\.event\.|inputs\.|secrets\.)[^}]*\}\}/;

export function checkWorkflow(name, text) {
  const problems = [];
  const add = (rule, message) => problems.push({ rule, message: `${name}: ${message}` });
  let doc;
  try {
    doc = parse(text);
  } catch (e) {
    return [{ rule: 'syntax', message: `${name}: YAMLとして読めません (${e.message})` }];
  }
  if (!doc || typeof doc !== 'object' || !doc.jobs)
    return [{ rule: 'syntax', message: `${name}: jobs がありません` }];

  // permissions
  if (doc.permissions === undefined) {
    add(
      'permissions',
      'トップレベルに permissions がありません(`permissions: {}` か `contents: read` を明示する)',
    );
  } else if (doc.permissions === 'write-all' || doc.permissions === 'read-all') {
    add('permissions', `permissions: ${doc.permissions} は広すぎます`);
  } else if (
    typeof doc.permissions === 'object' &&
    Object.values(doc.permissions ?? {}).includes('write')
  ) {
    add('permissions', 'トップレベルの permissions に write があります(必要な job にだけ付ける)');
  }

  // triggers
  const on = doc.on ?? doc[true];
  const triggers = typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys(on ?? {});
  for (const t of triggers) {
    if (t === 'pull_request_target' || t === 'workflow_run') {
      add(
        'dangerous-trigger',
        `トリガー ${t} は使わないでください(fork 由来のコードに特権を渡すおそれ)`,
      );
    }
  }

  const allRuns = [];
  for (const [jobId, job] of Object.entries(doc.jobs)) {
    if (job['timeout-minutes'] === undefined && !job.uses)
      add('timeout', `job "${jobId}" に timeout-minutes がありません`);
    const runsOn = JSON.stringify(job['runs-on'] ?? '');
    if (/self-hosted/.test(runsOn))
      add(
        'runner',
        `job "${jobId}" が self-hosted ランナーを使っています(public リポジトリでは禁止)`,
      );
    if (job.permissions === 'write-all')
      add('permissions', `job "${jobId}" の permissions: write-all は禁止です`);
    if (job.uses) checkUses(job.uses, `job "${jobId}"`);

    for (const [i, step] of (job.steps ?? []).entries()) {
      const label = `job "${jobId}" の step ${i + 1}${step.name ? ` (${step.name})` : ''}`;
      if (step.uses) {
        checkUses(step.uses, label);
        if (
          /^actions\/checkout@/.test(step.uses) &&
          String(step.with?.['persist-credentials']) !== 'false'
        ) {
          add(
            'checkout',
            `${label}: actions/checkout には persist-credentials: false を付けてください`,
          );
        }
      }
      for (const field of [step.run, step.with?.script]) {
        if (typeof field === 'string') {
          allRuns.push(field);
          if (UNTRUSTED.test(field)) {
            add(
              'script-injection',
              `${label}: run/script に外部入力や secrets を \${{ }} で直接埋め込んでいます。env: 経由で渡してください`,
            );
          }
        }
      }
    }
  }

  function checkUses(uses, label) {
    if (uses.startsWith('./')) return; // ローカルの Action / reusable workflow
    if (uses.startsWith('docker://')) {
      if (!/@sha256:[0-9a-f]{64}$/.test(uses))
        add('pinned-actions', `${label}: ${uses} はダイジェスト(@sha256:...)で固定してください`);
      return;
    }
    const ref = uses.split('@')[1];
    if (!ref || !SHA.test(ref))
      add('pinned-actions', `${label}: ${uses} はコミットSHA(40桁)で固定してください`);
  }

  if (requireQuality) {
    const joined = allRuns.join('\n');
    const required = [
      ['npm ci', /npm ci\b/],
      ['lint(ESLint)', /npm run lint|eslint/],
      ['フォーマット検査', /format:check|prettier --check/],
      ['型検査', /typecheck|tsc\b/],
      ['テスト', /npm (run )?test|vitest/],
      ['依存関係の脆弱性検査(npm audit)', /npm audit|npm run audit/],
    ];
    for (const [label, re] of required)
      if (!re.test(joined)) add('quality-steps', `${name}: ${label} のステップが見つかりません`);
  }
  return problems;
}

// CLI として実行されたときだけ動く
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  } catch {
    console.error(`ディレクトリ ${dir} が見つかりません`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`${dir} に .yml ファイルがありません`);
    process.exit(1);
  }
  const problems = files.flatMap((f) => checkWorkflow(f, readFileSync(join(dir, f), 'utf8')));
  if (problems.length > 0) {
    console.error(`ワークフローの検査で ${problems.length} 件の問題が見つかりました:\n`);
    for (const p of problems) console.error(`  ✗ [${p.rule}] ${p.message}`);
    process.exit(1);
  }
  console.log(
    `✅ ${files.length} 個のワークフローを検査しました。問題はありません: ${files.join(', ')}`,
  );
}
