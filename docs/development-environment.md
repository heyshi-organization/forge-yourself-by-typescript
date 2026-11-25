# 開発環境構築手順

ローカルの Node.js だけで完結します(Docker・Kubernetes・クラウドは不要)。

## 1. 必要なもの

| ツール                | バージョン             | 備考                                                        |
| --------------------- | ---------------------- | ----------------------------------------------------------- |
| Node.js               | **24.19 以上 25 未満** | `.nvmrc` に固定。`nvm use` / `asdf` / `mise` などで合わせる |
| npm                   | Node 付属のもの        |                                                             |
| git                   |                        |                                                             |
| (任意)GitHub CLI `gh` |                        | PR・Actionsの確認に便利                                     |

## 2. セットアップ

```bash
git clone https://github.com/heyshi-organization/forge-yourself-by-typescript.git   # または自分の fork / コピー
cd forge-yourself-by-typescript

node -v          # v24.x であること
npm ci           # package-lock.json のとおりに依存をインストール(npm install ではなく ci)
npm run verify   # 最初に、すべての検査が通ることを確認する(数十秒)
```

`npm ci --ignore-scripts` でも動きます(CIはこちら。依存の install script を実行しない)。

## 3. アプリを動かす(完成形)

GitHub に接続せず、メモリ上の Fake で動かせます(**実際のリポジトリは作られません**)。

```bash
cp .env.example .env        # GITHUB_CLIENT=fake になっている
npm run dev                 # 変更を検知して再起動(tsx watch)
# または
npm start                   # 1回起動
```

別のターミナルで:

```bash
curl -s localhost:3000/healthz
curl -i -X POST localhost:3000/v1/repository-requests \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"owner":"acme","ownerType":"organization","name":"hello-world","visibility":"private","topics":["demo"]}'
curl -s 'localhost:3000/v1/repository-requests?limit=5'
curl -s localhost:3000/openapi.json | head -c 300
```

障害の再現(`GITHUB_CLIENT=fake` のときだけ、名前で再現できる): `simulate-auth` / `simulate-permission` / `simulate-rate-limit` / `simulate-unavailable` / `simulate-timeout`。

```bash
curl -s -X POST localhost:3000/v1/repository-requests -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"owner":"acme","ownerType":"organization","name":"simulate-rate-limit","visibility":"private"}'
```

データは `./data/app.sqlite`(`.gitignore` 済み)。消せば初期化されます。`sqlite3 data/app.sqlite 'select id,status from provisioning_requests'` で中身も見られます。

### 本物の GitHub に接続するとき(任意・注意)

**実際にリポジトリが作られます。** 必ず**専用の検証用 Owner**で、権限を絞った fine-grained PAT を使ってください。

```bash
# .env を編集
GITHUB_CLIENT=octokit
GITHUB_TOKEN=<fine-grained PAT>      # .env は Git に入らない。絶対にコミットしない
```

## 4. 学習用コード(starter)を動かす

`starter/` は最初は未実装です(`NotImplementedError`)。課題を進めると動くようになります。

```bash
npm run exercise             # 課題の進捗一覧
npm run exercise -- 01       # 課題01の受け入れテスト
npm run test:starter         # starter/test に自分で書いたテスト
npx tsx starter/src/main.ts  # starter のアプリを起動(課題06〜10まで終わったら)
```

## 5. よく使うコマンド

| コマンド                                                   | 内容                                          |
| ---------------------------------------------------------- | --------------------------------------------- |
| `npm run typecheck`                                        | 型検査(reference と starter)                  |
| `npm run lint` / `npm run format` / `npm run format:check` | ESLint / Prettier                             |
| `npm test` / `npm run test:coverage`                       | テスト / カバレッジ                           |
| `npm run build`                                            | `dist/` にビルド(`npm run start:prod` で実行) |
| `npm run verify`                                           | **CIと同じ検査をまとめて実行**(コミット前に)  |
| `npm run docs:openapi`                                     | `docs/openapi.json` を再生成                  |
| `npm run starter:generate`                                 | (メンテナ用)reference から starter を再生成   |

## 6. 環境変数(`.env`)

| 変数                  | 既定                 | 説明                                                                               |
| --------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `GITHUB_CLIENT`       | `octokit`            | `fake` でGitHubに接続しない                                                        |
| `GITHUB_TOKEN`        | —                    | `octokit` のとき必須。**秘密**                                                     |
| `HOST` / `PORT`       | `127.0.0.1` / `3000` | ループバック以外は `ALLOW_PUBLIC_BIND=true` が必要(非推奨)                         |
| `DB_PATH`             | `./data/app.sqlite`  |                                                                                    |
| `LOG_LEVEL`           | `info`               | `fatal` `error` `warn` `info` `debug` `trace` `silent`                             |
| `GITHUB_TIMEOUT_MS`   | `10000`              | GitHub 1回の呼び出しのタイムアウト                                                 |
| `GITHUB_MAX_ATTEMPTS` | `4`                  | 試行回数(初回を含む)                                                               |
| `PROCESSING_LEASE_MS` | `300000`             | 処理中のままこの時間を超えた要求を「中断」とみなす(**最悪の処理時間より十分長く**) |

## 7. トラブルシューティング

| 症状                                           | 原因・対処                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `better-sqlite3` の読み込みエラー              | Node のバージョンが違う可能性。`node -v` を確認し、`rm -rf node_modules && npm ci`                                                                                                                    |
| `address already in use`                       | `PORT` を変える(`PORT=3001 npm start`)                                                                                                                                                                |
| `設定が不正です` で起動しない                  | 表示された変数名を確認(値は表示されない)                                                                                                                                                              |
| starter のテストが全部失敗する                 | 最初は正常です。課題を進めると通るようになります                                                                                                                                                      |
| VS Code / エディタが `@app/...` を解決できない | `tsconfig.json`(reference)と `tsconfig.starter.json`(starter)の `paths` を使っています。starter を開くときはエディタの TypeScript 設定で `tsconfig.starter.json` を選ぶか、`npm run typecheck` を使う |
