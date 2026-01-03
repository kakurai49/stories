# QA Pocket (Playwright / オフライン / Codespaces)

## 提供機能
- Playwright の `webServer` によるローカル開発サーバー起動
- ルートごとのスクリーンショット取得
- ビジュアルリグレッション（Playwright スナップショット）
- 外部ネットワークアクセスのブロック（オフラインフレンドリー）

## コマンド（リポジトリルートから）
- スクリーンショット取得:
  - `npm run qa:shots`
- ビジュアルリグレッション（初回はベースライン作成）:
  - `npm run qa:visual:update`
- ビジュアルリグレッション（比較）:
  - `npm run qa:visual`

## ルート設定
`.qa/routes.txt` を編集（1 行 1 ルート）。

## 生成物
- スクリーンショット: `.qa/artifacts/shots/*.png`
- テスト結果 / 差分: `.qa/artifacts/test-results/`
- HTML レポート: `.qa/artifacts/playwright-report/`

## 環境変数（任意）
- `QA_PROFILE=next|vite|generic`
- `QA_PORT=3000` / `QA_BASE_URL=http://127.0.0.1:3000`
- `QA_WEB_CMD="npm run dev -- --host 0.0.0.0 --port 3000"`
- `QA_BLOCK_EXTERNAL=0`（外部リクエストを許可）
- `QA_STRICT_EXTERNAL=1`（外部リクエスト発生で失敗）

<!-- QA_FLOW_EXPLORE_START -->
## 拡張: スクリーンフロー & エクスプロラトリ

### スクリーンフロー（BFS クロール → Mermaid/JSON）
- アーティファクト生成:
  - `npm run qa:flow`
- docs/qa へも公開:
  - `npm run qa:flow:publish`

環境変数:
- QA_FLOW_START_PATH (デフォルト "/")
- QA_FLOW_MAX_PAGES (デフォルト 200)
- QA_FLOW_MAX_DEPTH (デフォルト 10)
- QA_FLOW_PUBLISH (デフォルト 0)

出力:
- `.qa/artifacts/flow/screen-flow.md`
- `.qa/artifacts/flow/screen-flow.json`
- （任意）`docs/qa/screen-flow.md`, `docs/qa/screen-flow.json`

### エクスプロラトリ（ランダムウォーク、時間制限あり）
- `QA_EXPLORE_SECONDS=120 npm run qa:explore`
- シードで再現:
  - `QA_EXPLORE_SEED=123 QA_EXPLORE_SECONDS=60 npm run qa:explore`
- `QA_EXPLORE_STRATEGY=random-walk|guided-coverage|set-cover-greedy|set-cover` で戦略を切り替え（デフォルトは実行する spec に依存）。戦略は `.qa/tests/exploratory/strategies/` にあり、共通ランナー `.qa/tests/exploratory/runner.ts` で実行されます。

テスト失敗条件:
- HTTP ステータス >= 400
- pageerror / console error

添付するもの:
- explore-seed.txt
- explore-history.txt
- explore-errors.txt（あれば）
<!-- QA_FLOW_EXPLORE_END -->


<!-- QA_FLOW_COVERAGE_START -->
## 拡張: フロー / Fix List / ガイド付き Explore

### Flow（screen-flow.json/md）
- フローのアーティファクト生成:
  - `npm run qa:flow`
- docs/qa へも公開:
  - `npm run qa:flow:publish`

### Flow Analyze（到達不能 + Fix List）
- フローを解析して Fix List を生成:
  - `npm run qa:flow:analyze`
- ドキュメント公開:
  - `npm run qa:flow:analyze:publish`
- ワンショット（flow + analyze + docs 公開）:
  - `npm run qa:fixlist`

到達不能の判定:
- `.qa/known-routes.txt`（期待ルート）
  から
- `screen-flow.json` のページ（リンク経由で到達できるページ）
  を差し引いたもの

### ガイド付き Explore（未訪問優先）
- `QA_EXPLORE_SECONDS=120 npm run qa:explore:guided`
- JSON を docs に公開:
  - `QA_EXPLORE_PUBLISH=1` を設定

### まとめて実行（推奨）
- `bash .qa/run-flow-coverage.sh`

出力（コミット対象）:
- `docs/qa/screen-flow.md|json`
- `docs/qa/flow-analysis.md|json`
- `docs/qa/link-fix-list.md`
- `docs/qa/guided-coverage.json`
- `docs/qa/QA_POCKET_RUNLOG.md`
<!-- QA_FLOW_COVERAGE_END -->

## エクスプロラトリ戦略プラグイン

エクスプロラトリテストは `QA_EXPLORE_STRATEGY` でナビゲーション戦略を指定し、`.qa/tests/exploratory/strategies/` の実装を `index.ts` の `getStrategy` 経由で読み込みます。利用可能な戦略（エイリアス `set-cover` を含む）は `random-walk`、`guided-coverage`、`set-cover-greedy` の 3 種です。

- **共通入力:** 各戦略は現在ページから収集したリンク候補、`QA_EXPLORE_SEED` 由来の RNG、直近/訪問済みパス、カバレッジ状態を含む `ExploreContext` を受け取ります。`config.restartEvery` を見て、一定間隔でスタート URL へ戻ることもあります。  

- **random-walk** (`random-walk.ts`): 最大 200 件の生候補を保持（`skipBeforeSlice=true`, `dedupeByPath=false`）。候補がなければ開始ページへリスタート、あれば一様ランダムに選んで遷移します。  

- **guided-coverage** (`guided-coverage.ts`): `init` で `screen-flow.json` を読み、既知ページのターゲット集合を構築しつつフローのメタデータから `startPath` を上書きする場合があります。パスで重複排除し、自己リンクを除外、最大 400 件を処理。各ステップで (1) 設定された周期や行き止まりでリスタートし、(2) 未訪問のターゲットを優先、(3) 次に未訪問全般、(4) それ以外を選択し、直近パスは可能なら避けます。  

- **set-cover-greedy** (`set-cover-greedy.ts`): カバレッジモデルを用いて、どの候補が新しいカバレッジ（ルート/API/アセット）を最も増やすかを推定。guided と同様にパス重複排除・自己リンク除外・最大 400 件・任意の周期リスタートに対応。カバレッジ増分が最大の候補を選び、全候補が同程度なら直近を避けつつランダムにフォールバックします。
