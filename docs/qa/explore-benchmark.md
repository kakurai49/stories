# Explore benchmark guide

探索用の Strategy を seed ごとに比較するベンチマーク実行手順です。既存の探索挙動は変更せず、ベンチ時のみ追加のログ・メトリクスを出力します。

## 1. 目的
- ランダム/ガイド付きなど複数 Strategy の探索性能（新規ルート発見、重複率、エラー率、API/フロー被覆）を seed を変えて比較する。
- 各 run の証跡（visited・errors・steps・リクエスト上位など）を残し、後から分析できるようにする。

## 2. コマンド
- npm スクリプト: `npm run qa:explore:bench`
- 主な環境変数（すべて省略可）
  - `QA_EXPLORE_BENCH_SECONDS` (default: `60`)
  - `QA_EXPLORE_BENCH_SEEDS` (default: `1,2,3,4,5`)
  - `QA_EXPLORE_BENCH_STRATEGIES` (default: `random-walk,guided-coverage,set-cover-greedy,rl-bandit`)
  - `QA_EXPLORE_BENCH_START_PATH` (任意)
  - `QA_EXPLORE_BENCH_OUT_DIR` (default: `.qa/artifacts/explore-bench/<timestamp>`)
  - `QA_EXPLORE_BENCH_PARALLEL` (default: `1`)

### 実行例
```bash
# 2 戦略 x seeds=1,2 を 15 秒で計測し、出力先を固定
QA_EXPLORE_BENCH_SECONDS=15 \
QA_EXPLORE_BENCH_SEEDS=1,2 \
QA_EXPLORE_BENCH_STRATEGIES=random-walk,set-cover-greedy \
QA_EXPLORE_BENCH_OUT_DIR=.qa/artifacts/explore-bench/sample \
npm run qa:explore:bench
```

## 3. 出力
- ルート: `<OUT_DIR>/runs/<strategy>/seed-<seed>/`
  - `run.json`: メタ情報と主要メトリクス（steps, uniqueRoutes, revisitRate, errorsTotal/http/console/page, restarts, flowTargetsHit/Total, coverageRate, uniqueApis, requestsTotal など）
    - meta には commit hash・seconds・seed・startPath・restartEvery・baseURL・blockedExternalRequests などを格納
  - `visited.txt|json`: 正規化パスの訪問順
  - `errors.jsonl`: 種別別のエラー詳細（http/console/pageerror/navigation）
  - `steps.jsonl`: 各ステップの from/to/action/reason/candidate 数など
  - `requests-top.json`: 同一 origin へのリクエスト上位リスト（path, kind, method, count）
  - 既存の artifacts (`guided-coverage.json` など) も `QA_EXPLORE_OUTPUT_DIR` に出力される
- サマリー: `<OUT_DIR>/summary.json|csv|md`
  - Strategy ごとの run 配列と統計（平均/中央値/最小/最大）
  - `summary.md` には集計テーブルを出力（runs/passed/failed、uniqueRoutes・steps・errorsTotal の統計、revisitRate 平均）

## 4. 既存挙動との互換
- `QA_EXPLORE_OUTPUT_DIR` を指定すると探索 artifacts の出力先を上書きできます（未指定時は従来どおり `.qa/artifacts/explore/`）。
- 追加ログは `QA_EXPLORE_BENCH=1` またはベンチスクリプト実行時のみ有効化され、通常の `qa:explore` 実行は従来の出力のみになります。

## 5. 分析の観点（例）
- **新規 route 発見**: `uniqueRoutes` や `coverageRate` を比較。
- **重複率**: `revisitRate` が低いほど効率的。
- **安定性**: `errorsTotal` や `httpErrors` の少なさ、`blockedExternalRequests` の有無。
- **API/flow 被覆**: `uniqueApis` や `flowTargetsHit/Total` を確認。
- **リクエスト偏り**: `requests-top.json` で特定パスへの集中を検知。
