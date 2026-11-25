# ADR-0002: アーキテクチャ(レイヤーと依存の向き)

- 状態: 採用
- 日付: 2026-11-25

## 背景

要件: ビジネスロジックが GitHub API・DB の具体的な実装に依存しない / テスト時に差し替えられる / レイヤーを増やすこと自体を目的にしない。

## 選択肢

| 案                                                                  | メリット                                                                     | デメリット                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| A. ハンドラに全部書く                                               | 最小                                                                         | テストできない。GitHub/DB が直結し、責務が混ざる |
| B. Controller / Service / Repository / Client の4層                 | 責務が明確                                                                   | 小さいアプリには層が多い                         |
| C. **B を基本に、外部との境界だけをインターフェース(ポート)にする** | 差し替えが必要な所(GitHub・DB・時計・ID)だけ抽象化。過剰な抽象化を避けられる | 「どこまで抽象化するか」の判断が要る             |

## 決定: C

```
HTTP層(http/)          ← Fastify・入力検証・エラー変換。ビジネス判断はしない
   │ 呼ぶ
   ▼
サービス層(services/)   ← ユースケース(ProvisioningService)。冪等性・状態遷移・復旧
   │ 使う(インターフェース経由)
   ├─▶ RequestRepository(db/)          ポート。実装: SQLite / InMemory
   └─▶ RepositoryProvisioner(provisioning/) ポート。実装: ResilientProvisioner
            │ 使う(インターフェース経由)
            ▼
         GitHubClient(github/)           ポート。実装: Octokit / Fake

ドメイン(domain/)       ← 型・状態遷移。外部ライブラリに依存しない純粋なコード
横断(shared/, errors/, logging/, async/, schemas/)
```

**依存の向きのルール**

1. `domain/` は他の層を import しない(最も内側)
2. `services/` は `http/` を知らない。`db/`・`github/` は**インターフェースの型だけ**を import し、具体的な実装クラスは import しない
3. 具体的な実装を `new` するのは `composition.ts`(Composition Root)だけ

ポート(インターフェース)の置き場所: `db/request-repository.ts`、`github/types.ts`、`provisioning/types.ts`。

## 結果

- ユニットテストは Fake・InMemory で外部なしに書ける(ネットワーク・DB不要)
- GitHub の呼び出し(`GitHubClient`)と「リポジトリを用意するユースケース」(`RepositoryProvisioner`)を分けたので、
  リトライや「結果が分からない失敗」の扱いを、サービスのロジックと混ぜずに済む
- 受け入れるトレードオフ: ファイル数は増える。ただし各ファイルは小さく、課題の単位(1課題 = 数ファイル)と対応する
