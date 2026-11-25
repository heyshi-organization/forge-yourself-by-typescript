// reference/src から starter/src を生成する(メンテナ用ツール)。
//
// reference のソースには、次のマーカーで「学習者に実装させる範囲」を書いてある:
//
//   // @starter-begin ex03        ← ここから完成形の実装(starter では削除される)
//   ...完成形のコード...
//   // @starter-else              ← ここから starter に出力する内容
//   //| export function foo() {   ← 先頭の `//| ` を外した行が starter に出力される
//   //|   throw new NotImplementedError('03');
//   //| }
//   // @starter-end
//
// 使い方:
//   node scripts/generate-starter.mjs           starter/src を再生成する
//   node scripts/generate-starter.mjs --check   生成結果と starter/src が一致するか検査する(CI用)
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'reference', 'src');
const outDir = join(root, 'starter', 'src');
const check = process.argv.includes('--check');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function transform(source, fileLabel) {
  const out = [];
  let mode = 'normal'; // normal | reference | starter
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    const where = `${fileLabel}:${i + 1}`;
    if (/^\s*\/\/ @starter-begin\b/.test(line)) {
      if (mode !== 'normal') throw new Error(`${where}: マーカーが入れ子になっています`);
      mode = 'reference';
    } else if (/^\s*\/\/ @starter-else\b/.test(line)) {
      if (mode !== 'reference')
        throw new Error(`${where}: @starter-else が @starter-begin の外にあります`);
      mode = 'starter';
    } else if (/^\s*\/\/ @starter-end\b/.test(line)) {
      if (mode === 'normal')
        throw new Error(`${where}: @starter-end に対応する begin がありません`);
      mode = 'normal';
    } else if (mode === 'normal') {
      out.push(line);
    } else if (mode === 'starter') {
      const m = line.match(/^\s*\/\/\|(?: (.*))?$/);
      if (!m) throw new Error(`${where}: @starter-else の中の行は //| で始めてください: ${line}`);
      out.push(m[1] ?? '');
    }
    // mode === 'reference' の行は捨てる
  });
  if (mode !== 'normal') throw new Error(`${fileLabel}: @starter-end がありません`);

  let text = out.join('\n');
  return text;
}

/** NotImplementedError を使っているのに import が無ければ追加する。 */
function ensureNotImplementedImport(text, filePath) {
  if (!text.includes('NotImplementedError') || /import[^;]*NotImplementedError/.test(text))
    return text;
  if (filePath.endsWith(join('shared', 'not-implemented.ts'))) return text;
  let rel = posix.relative(
    posix.dirname(relative(srcDir, filePath).split(sep).join('/')),
    'shared/not-implemented.js',
  );
  if (!rel.startsWith('.')) rel = `./${rel}`;
  const lines = text.split('\n');
  let last = -1;
  lines.forEach((l, i) => {
    if (/^import .*;$/.test(l) || /^\} from .*;$/.test(l)) last = i;
  });
  lines.splice(last + 1, 0, `import { NotImplementedError } from '${rel}';`);
  return lines.join('\n');
}

const prettierConfig = await prettier.resolveConfig(join(root, 'prettier.config.js'));

const expected = new Map();
for (const file of walk(srcDir).filter((f) => f.endsWith('.ts'))) {
  const rel = relative(srcDir, file);
  let text = transform(readFileSync(file, 'utf8'), `reference/src/${rel}`);
  text = ensureNotImplementedImport(text, file);
  text = await prettier.format(text, { ...prettierConfig, filepath: file });
  expected.set(rel, text);
}

if (check) {
  const problems = [];
  const actual = existsSync(outDir) ? walk(outDir).map((f) => relative(outDir, f)) : [];
  for (const [rel, text] of expected) {
    const p = join(outDir, rel);
    if (!existsSync(p)) problems.push(`不足: starter/src/${rel}`);
    else if (readFileSync(p, 'utf8') !== text) problems.push(`差分: starter/src/${rel}`);
  }
  for (const rel of actual) if (!expected.has(rel)) problems.push(`余分: starter/src/${rel}`);
  if (problems.length > 0) {
    console.error(`starter/src が reference/src と同期していません:\n  ${problems.join('\n  ')}`);
    console.error('\nreference を変更した場合は `npm run starter:generate` を実行してください。');
    process.exit(1);
  }
  console.log(`starter/src は reference/src と同期しています(${expected.size} ファイル)`);
} else {
  rmSync(outDir, { recursive: true, force: true });
  for (const [rel, text] of expected) {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  console.log(`starter/src を生成しました(${expected.size} ファイル)`);
}
