# QA Pocket 探索アルゴリズム解説

探索系テスト（`npm run qa:explore*`）の挙動を簡潔にまとめたメモです。ランダムウォークとガイド付き探索の違い、調整用の環境変数、成果物の位置を確認する際に参照してください。

## コマンド早見
- ランダムウォーク（時間制限付き）: `QA_EXPLORE_SECONDS=120 npm run qa:explore`
- ガイド付き探索（未訪問優先＋リスタート）: `QA_EXPLORE_SECONDS=120 npm run qa:explore:guided`
- 集合被覆優先（セットカバー）: `QA_EXPLORE_SECONDS=60 QA_EXPLORE_SEED=123 QA_EXPLORE_STRATEGY=set-cover-greedy npm run qa:explore`
- docs/qa へ JSON を公開: 上記に `QA_EXPLORE_PUBLISH=1` を付与
- Strategy 切替: `QA_EXPLORE_STRATEGY=random-walk|guided-coverage|set-cover-greedy`（alias: `set-cover`）。`.qa/tests/exploratory/strategies/` に追加するだけで拡張可能です。【F:.qa/tests/exploratory/strategies/index.ts†L1-L16】

## 実装構成
- RNG・リンク収集・成果物生成は共通の runner（`.qa/tests/exploratory/runner.ts`）で管理し、探索先の選択ロジックのみ Strategy として差し替えます。【F:.qa/tests/exploratory/runner.ts†L1-L180】
- Strategy は `name/candidateLimit/dedupe/skipSelf/skipBeforeSlice` と `nextAction` を持ち、`QA_EXPLORE_STRATEGY` で選択されます。【F:.qa/tests/exploratory/types.ts†L40-L76】【F:.qa/tests/exploratory/strategies/index.ts†L1-L16】

## ランダムウォーク（`npm run qa:explore`）
- xorshift RNG（`QA_EXPLORE_SEED`、未指定は現在時刻）で候補リンクの選択のみ乱数化します。【F:.qa/tests/exploratory/rng.ts†L1-L17】【F:.qa/tests/exploratory/strategies/random-walk.ts†L1-L17】
- 開始パスは `QA_EXPLORE_START_PATH`（デフォルトはルートリストの先頭または `/`）。`a[href]` から最大 200 件取得し、`mailto:`/`tel:`/`javascript:` などを除外した上でランダムに 1 件を内部リンクから選択します。【F:.qa/tests/exploratory/links.ts†L1-L75】【F:.qa/tests/exploratory/strategies/random-walk.ts†L8-L17】
- 外部ドメインや自己リンクは除外し、HTTP 400+ や console/pageerror が発生した時点で失敗扱い。行き止まりでは開始地点へ戻ります。【F:.qa/tests/exploratory/runner.ts†L46-L103】【F:.qa/tests/exploratory/strategies/random-walk.ts†L8-L17】
- 実行後にシード・履歴・エラーを添付します（`explore-seed.txt`, `explore-history.txt`, `explore-errors.txt`）。【F:.qa/tests/exploratory/runner.ts†L130-L144】

## ガイド付き探索（`npm run qa:explore:guided`）
- `.qa/artifacts/flow/screen-flow.json`（`QA_FLOW_JSON` で変更可）を読み、`pages` をターゲット集合として保持します。【F:.qa/tests/exploratory/strategies/guided-coverage.ts†L1-L17】
- リンク候補を最大 400 件収集し（外部・自己リンク・スキップ対象を除外、重複はパス単位で排除）、以下を優先します。【F:.qa/tests/exploratory/links.ts†L1-L75】【F:.qa/tests/exploratory/strategies/guided-coverage.ts†L19-L42】
  1. targetSet に存在し未訪問のページ
  2. 未訪問のページ
  3. それ以外（重複除外済みの全候補）
- 直近 5 ステップのパスは避け、空になった場合のみ回避前の集合から選択します。【F:.qa/tests/exploratory/strategies/guided-coverage.ts†L31-L42】
- `QA_EXPLORE_RESTART_EVERY`（既定 15）ステップごとに開始地点へ戻り、候補ゼロ時も開始に戻ります。【F:.qa/tests/exploratory/strategies/guided-coverage.ts†L20-L30】【F:.qa/tests/exploratory/runner.ts†L110-L125】
- 実行結果は `guided-coverage.json` として `.qa/artifacts/explore/` に保存（`QA_EXPLORE_PUBLISH=1` で `docs/qa/` にも出力）。シード・訪問・未訪問一覧も添付します。【F:.qa/tests/exploratory/runner.ts†L146-L178】

## よく使う環境変数
- `QA_EXPLORE_SECONDS`: 探索時間（秒）。共通
- `QA_EXPLORE_SEED`: 乱数シード。共通
- `QA_EXPLORE_START_PATH`: 起点パス。共通
- `QA_EXPLORE_PUBLISH`: `1` で guided の JSON を `docs/qa/` に書き出し
- `QA_EXPLORE_RESTART_EVERY`: guided のリスタート間隔（ステップ数）
- `QA_FLOW_JSON`: guided が参照する flow JSON のパス（省略時は `.qa/artifacts/flow/screen-flow.json`）
- `QA_EXPLORE_STRATEGY`: 使用する探索戦略（`random-walk` / `guided-coverage` / `set-cover-greedy`）。デフォルトは実行する spec に応じて自動設定。【F:.qa/tests/exploratory/env.ts†L16-L42】

## 成果物の場所
- ランダムウォーク: `.qa/artifacts/explore/` に履歴・シード（テスト実行時に添付）。
- ガイド付き: `.qa/artifacts/explore/guided-coverage.json`（`QA_EXPLORE_PUBLISH=1` 時は `docs/qa/guided-coverage.json`）。
- セットカバー探索: guided と同様に `.qa/artifacts/explore/guided-coverage.json` に記録（publish 時は `docs/qa/` にも出力）。

## セットカバー（`QA_EXPLORE_STRATEGY=set-cover-greedy` / alias: `set-cover`）
- ページ遷移ごとの被覆要素（route/api/asset）を Runner で蓄積し、まだ観測されていない要素を最も増やせるリンクを貪欲に選択します。【F:.qa/tests/exploratory/coverage.ts†L1-L41】【F:.qa/tests/exploratory/strategies/set-cover-greedy.ts†L1-L89】
- 重複出現しがちなパスやリソースは df（出現ページ数）で減衰させ、全候補の gain が 0 の場合は recent（直近 5）を外した乱択で移動します。【F:.qa/tests/exploratory/strategies/set-cover-greedy.ts†L5-L89】
- guided と同様に `QA_EXPLORE_RESTART_EVERY` で定期的に起点へ戻るため、ループしやすいサイトでも探索が進みます。【F:.qa/tests/exploratory/strategies/set-cover-greedy.ts†L45-L89】
- 使い分けの目安:
  - `random-walk`: まず広く当たりたいときの手軽なランダム探索
  - `guided-coverage`: flow のターゲット（未訪問ページ）を優先して埋めたいとき
  - `set-cover-greedy`: 共有リソースに偏らず、新規要素の被覆を最大化したいとき（seed 指定推奨）

## 手動確認のスモーク
- `QA_EXPLORE_SECONDS=60 QA_EXPLORE_SEED=123 npm run qa:explore`
- `QA_EXPLORE_SECONDS=60 QA_EXPLORE_SEED=123 npm run qa:explore:guided`
いずれもエラーで落ちずに走り、従来通りの成果物（guided は `guided-coverage.json` 生成、publish 時は `docs/qa/` への出力）を確認します。【F:.qa/tests/exploratory/runner.ts†L130-L178】
