# QA Pocket 情報アーキテクチャ（Playwright MCP 連携用メモ）

## 1. 目的と前提（Step1: Codespaces 内・ローカルのみ）
- QA Pocket は Playwright `webServer` でローカルサーバーを立ち上げ、外部リクエストをデフォルト遮断する前提で組まれている。環境変数でポートやブロック設定を制御可能。【F:.qa/README.md†L3-L31】
- テスト実行時は `qa.blockExternal` が true ならページリクエストを origin ベースでフィルタし、外部アクセスは abort される。遮断ログは `blocked-requests.txt` として添付でき、strict モードなら失敗扱いになる。【F:.qa/tests/_support/test.ts†L6-L82】
- 既存運用の基本線は `bash .qa/run-flow-coverage.sh` で flow→analyze→guided explore→runlog を一括生成し、`docs/qa` に成果物を公開する形。【F:.qa/run-flow-coverage.sh†L17-L104】

## 2. 既存データの“入口”と“出口”
- 入口
  - ルート定義: `.qa/routes.txt`（flow/visual の起点）。【F:.qa/README.md†L17-L23】
  - 既知ルート: `.qa/known-routes.txt`（到達不能判定の基準）。【F:.qa/README.md†L87-L92】
  - 探索パラメータ: `QA_FLOW_*`, `QA_EXPLORE_*` などで開始パス・深さ・時間・戦略を指定。【F:.qa/README.md†L41-L66】
- 出口（コミット対象のサマリー層）
  - フローと分析: `docs/qa/screen-flow.md|json`, `docs/qa/flow-analysis.md|json`。【F:.qa/README.md†L47-L105】
  - リンク修正リスト: `docs/qa/link-fix-list.md`（到達不能や dead end）。【F:docs/qa/link-fix-list.md†L1-L20】
  - 探索実績: `docs/qa/guided-coverage.json`（訪問 32/32 で coverage=1 が最新）。【F:docs/qa/guided-coverage.json†L1-L47】
  - 実行履歴: `docs/qa/QA_POCKET_RUNLOG.md`（flow/analyze/guided の出力と blockedExternal 件数を時系列管理）。【F:docs/qa/QA_POCKET_RUNLOG.md†L5-L80】
  - 探索ベンチ: `docs/qa/explore-benchmarks/stories/summary-04.md` などで strategy ごとの route/requests/revisit 分布を記録（例: guided-coverage=14 routes, requests≈799/run）。【F:docs/qa/explore-benchmarks/stories/summary-04.md†L5-L14】

## 3. データレイヤ別の使いどころ
- **構造レイヤ（フロー）**: `flow-analysis.*` で baseURL/startPath/crawledPages/edges/broken/blockedExternal などのメタ指標を保持。最新 run は crawledPages=94・broken=0・blockedExternal=0 で、MCP での再現対象は dead end 1 件のみと読める。【F:docs/qa/flow-analysis.md†L3-L29】
- **カバレッジレイヤ（訪問状態）**: `guided-coverage.json` が探索経路を steps つきで全件記録するため、MCP に「未訪問ノードを補完する探索タスク」を指示する際の入力に使える。【F:docs/qa/guided-coverage.json†L11-L74】
- **履歴レイヤ（連続監視）**: `QA_POCKET_RUNLOG.md` で blockedExternal や broken 件数の推移を追えるため、「前回から変化したエラーだけ深掘り」といった差分ドリブンの MCP 呼び出し条件を設計しやすい。【F:docs/qa/QA_POCKET_RUNLOG.md†L19-L162】
- **戦略レイヤ（探索特性）**: explore bench は strategy ごとの uniqueRoutes/requests/revisitRate を持ち、LLM 駆動探索のベンチマーク設計に流用できる（例: guided-coverage と set-cover-greedy が coverage 14 で同値、rl-bandit はリクエスト多め）。【F:docs/qa/explore-benchmarks/stories/summary-04.md†L5-L24】【F:docs/qa/explore-benchmark.md†L29-L41】

## 4. Playwright MCP への組み込み方（情報アーキテクチャ案）
- **入力チャネル**
  - (A) フロー差分: `flow-analysis.json` を読み、`broken`/`deadEndsOk`/`blockedExternal` の増減があったルートを「再現チケット」として MCP に渡す。
  - (B) カバレッジ差分: `guided-coverage.json` の `uncovered` と `visited` を比較し、未訪問ノードを優先する探索ステップを提示する。
  - (C) Fix リスト: `link-fix-list.md` の dead end/未達成タスクをそのまま MCP の「再現シナリオ入力」とする。
  - (D) 探索ベンチ: summary-XX の uniqueRoutes/requests/revisitRate を参照し、MCP 探索を「どの strategy の代替か」ラベル付きでログを残す。
- **出力チャネル**
  - 一時成果物: `.qa/artifacts/mcp/<timestamp>/` に trace/video/snapshot を保存（従来の artifacts と並置）。
  - 共有成果物: `docs/qa/mcp/<date>-triage.md`（再現ステップ・根拠リンク・trace パス）、`docs/qa/mcp/<date>-tests.md`（生成された @playwright/test のスケッチ）など、コミット可能な形で残す。
  - 既存 runlog 拡張: runlog に「MCP triage 実行」を追記して、flow/analyze/guided と紐付ける。
- **ガードレール**
  - baseURL/port/env は QA Pocket の設定をそのまま利用し、MCP 側も同一 origin 以外を route abort で遮断する（QA_BLOCK_EXTERNAL/QA_STRICT_EXTERNAL を尊重）。【F:.qa/qa.config.ts†L69-L131】【F:.qa/tests/_support/test.ts†L6-L82】
  - 大きな `browser_snapshot` を避けるため、MCP には `guided-coverage` の対象パス単位で短時間セッションを分割し、コンテキスト肥大化を防ぐ。

## 5. 期待効果と優先度
- カバレッジは既に 100%（guided 32/32）で broken=0 なので、MCP で大幅なページ発見は見込み薄。一方、dead end やコンソール例外が再発した時に「再現＋trace＋テスト化」を即座に回す運用が最もリターンが大きい。【F:docs/qa/guided-coverage.json†L11-L48】【F:docs/qa/flow-analysis.md†L3-L29】
- 探索戦略間の coverage 差は小さいが、requests/revisit の負荷差があるため、MCP の探索は「高コスト操作（フォーム/モーダル）専用モード」として併用し、既存 guided/set-cover でリンク探索を維持するのが効率的。【F:docs/qa/explore-benchmarks/stories/summary-04.md†L5-L24】
- runlog のブロック件数や broken 件数の差分をトリガーにする設計により、「何も変わらない run では MCP を起動しない」節約運用が可能になる。【F:docs/qa/QA_POCKET_RUNLOG.md†L19-L162】
