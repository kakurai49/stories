# QA Pocket 探索アルゴリズム解説

探索系テスト（`npm run qa:explore*`）の挙動を簡潔にまとめたメモです。ランダムウォークとガイド付き探索の違い、調整用の環境変数、成果物の位置を確認する際に参照してください。

## コマンド早見
- ランダムウォーク（時間制限付き）: `QA_EXPLORE_SECONDS=120 npm run qa:explore`
- ガイド付き探索（未訪問優先＋リスタート）: `QA_EXPLORE_SECONDS=120 npm run qa:explore:guided`
- docs/qa へ JSON を公開: 上記に `QA_EXPLORE_PUBLISH=1` を付与

## ランダムウォーク（`npm run qa:explore`）
- xorshift ベースの RNG をシード（`QA_EXPLORE_SEED`、未指定なら現在時刻）で初期化し、リンク選択にのみ乱数を使用します。【F:.qa/tests/exploratory/random-walk.spec.ts†L4-L107】
- 開始パスは `QA_EXPLORE_START_PATH`（デフォルトはルートリストの先頭または `/`）。開始 URL に遷移後、`a[href]` から最大 200 件を取得し、`mailto:`, `tel:`, `javascript:` などを除外してランダムに 1 件選びます。【F:.qa/tests/exploratory/random-walk.spec.ts†L27-L107】
- 外部ドメインはスキップし、リンク先が HTTP 400 以上またはコンソール/ページエラーを出した時点で失敗扱い。行き止まりでは開始地点に戻って再探索します。【F:.qa/tests/exploratory/random-walk.spec.ts†L57-L107】
- 実行後にシード・移動履歴（必要ならエラー）を添付します（`explore-seed.txt`, `explore-history.txt`, `explore-errors.txt`）。【F:.qa/tests/exploratory/random-walk.spec.ts†L108-L123】

## ガイド付き探索（`npm run qa:explore:guided`）
- 事前生成された `screen-flow.json`（既定は `.qa/artifacts/flow/`）を読み込み、到達目標ページ集合をターゲットとして保持します。【F:.qa/tests/exploratory/guided-coverage.spec.ts†L45-L66】
- RNG はランダムウォークと同じ xorshift シード方式。リンク候補を最大 400 件収集し、外部・自己リンク・スキップ対象を除外したうえで、以下の優先順位で選択します。【F:.qa/tests/exploratory/guided-coverage.spec.ts†L125-L175】
  1. フローに存在し未訪問のページ
  2. 未訪問のページ
  3. それ以外（重複除外済みの全候補）
- 直近 5 ステップのパスは避けるようフィルタリングし、候補が空なら回避前の集合からランダムに選びます。【F:.qa/tests/exploratory/guided-coverage.spec.ts†L164-L175】
- `QA_EXPLORE_RESTART_EVERY`（デフォルト 15）ステップごとに開始ページへ戻り、袋小路を緩和します。【F:.qa/tests/exploratory/guided-coverage.spec.ts†L118-L123】
- 実行結果は訪問率や未訪問一覧を含む `guided-coverage.json`（`.qa/artifacts/explore/`、`QA_EXPLORE_PUBLISH=1` で `docs/qa/` にも出力）として保存されます。【F:.qa/tests/exploratory/guided-coverage.spec.ts†L177-L218】

## よく使う環境変数
- `QA_EXPLORE_SECONDS`: 探索時間（秒）。共通
- `QA_EXPLORE_SEED`: 乱数シード。共通
- `QA_EXPLORE_START_PATH`: 起点パス。共通
- `QA_EXPLORE_PUBLISH`: `1` で guided の JSON を `docs/qa/` に書き出し
- `QA_EXPLORE_RESTART_EVERY`: guided のリスタート間隔（ステップ数）
- `QA_FLOW_JSON`: guided が参照する flow JSON のパス（省略時は `.qa/artifacts/flow/screen-flow.json`）

## 成果物の場所
- ランダムウォーク: `.qa/artifacts/explore/` に履歴・シード（テスト実行時に添付）。
- ガイド付き: `.qa/artifacts/explore/guided-coverage.json`（`QA_EXPLORE_PUBLISH=1` 時は `docs/qa/guided-coverage.json`）。
