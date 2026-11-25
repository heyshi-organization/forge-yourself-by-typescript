// 課題07: retry / computeBackoffMs のテストを自分で書く。
//
// 目的: 「バグを見つけられるテスト」を書けるようになること。
// 検査: `npm run exercise -- 07`
//   1. 完成形の実装(reference)であなたのテストが全部通る
//   2. わざとバグを仕込んだ10種類の実装に対して、テストが失敗する(= バグを検出できる)
//
// 詳しい手順とヒントは docs/exercises/07-testing.md を読むこと。
import { describe, it } from 'vitest';
// import { retry, computeBackoffMs, RetryExhaustedError } from '@app/async/retry.js';

describe('computeBackoffMs', () => {
  it.todo('失敗回数が増えると、待ち時間の上限が2倍ずつ増える');
  it.todo('待ち時間は maxDelayMs で頭打ちになる');
  it.todo('乱数(random)によって 0 〜 上限 の範囲で変わる');
});

describe('retry', () => {
  it.todo('最初に成功したら、再試行せずにその値を返す');
  it.todo('...(ここに自分でテストケースを追加していく)');
});
