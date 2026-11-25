# ADR-0008: タイムアウトとリトライ

- 状態: 採用
- 日付: 2026-11-25

## 決定

### タイムアウト

- GitHub への**1回の呼び出しごと**にタイムアウト(既定10秒、`GITHUB_TIMEOUT_MS`)。`withTimeout` が `AbortController` で通信を中断する
- Octokit(`@octokit/request`)は、`AbortError` には `status = 500` を付けてそのまま再throwし、それ以外(`AbortSignal.timeout` の `TimeoutError` や接続エラー)は `status: 500` の `RequestError` に包む(`node_modules/@octokit/request/dist-bundle/index.js` で確認)。
  どちらも status が 500 になり、5xx(GitHub側の障害)と区別しにくいため、**こちらで時間を計って自前の `TimeoutError` を投げる**(Octokit の挙動に依存しない)。念のため分類側でも `AbortError` は status に関係なく `timeout` にする

### リトライするもの・しないもの

| 種類                                                 | 再試行                             | 理由                                                                                        |
| ---------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `timeout` / `network` / `unavailable`(5xx)           | する                               | 一時的な障害                                                                                |
| `rate_limit`                                         | する(待ち時間が上限以内のときだけ) | `Retry-After` / `x-ratelimit-reset` の分だけ待つ。上限(`maxDelayMs`=10秒)を超えるなら諦める |
| `auth`(401) / `permission`(403)                      | しない                             | 何度やっても同じ。**設定の問題**                                                            |
| `conflict`(同名あり) / `rejected`(422) / `not_found` | しない                             | 入力の問題                                                                                  |
| `unknown`                                            | しない                             | 原因不明のものを繰り返さない                                                                |

### バックオフ

指数バックオフ + **Full Jitter**: `待ち時間 = random(0, min(maxDelay, base × 2^(失敗回数-1)))`。
複数のクライアントが同時に失敗しても、再試行のタイミングが揃わない(再試行の集中=thundering herd を避ける)。
既定: 最大4回、base 500ms、上限10秒。

### リトライによる重複作成の防止(最重要)

`POST`(作成)は冪等ではない。**タイムアウトしても、GitHub側では作成が成功しているかもしれない**(`ambiguous` な失敗)。

1. 作成が `timeout/network/unavailable` で失敗した場合、「結果不明」を記録する
2. その後の再試行で `conflict`(すでに存在)が返ったら、**即座に「他人が作った」と断定せず**、`getRepository` で作成日時を確認する
3. 今回の処理の開始時刻以降の作成なら、**前回の試行で作られたもの**として成功扱いにする
4. 再試行を使い切って終わる場合も、最後に1回だけ作成済みか確認する

## 結果

- 試行回数に上限があるので、最悪の処理時間に上限がある(ADR-0006)
- 「GitHubを呼ぶ回数」と「リポジトリが作られる回数」を分けて考える、という設計の勘所を学べる
