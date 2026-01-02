# QA Pocket ポータブルマニュアル

## 1. これは何か
QA Pocket は、Playwright ベースの QA 用ツールキットです。ローカル開発サーバーを自動起動しながら、オフライン前提で画面キャプチャ・ビジュアルリグレッション・画面フローの網羅性分析・探索的テストをまとめて回せます。`docs/qa` 配下に成果物を残せるため、レポートをそのままリポジトリにコミットできます。

### 提供機能のサマリ
- Playwright `webServer` によるローカル開発サーバー起動（Next/Vite/汎用を自動判定）。【F:.qa/setup.sh†L4-L159】
- 指定ルートのスクリーンショット取得とビジュアルリグレッション（スナップショット比較）。【F:.qa/README.md†L3-L30】
- 外部ネットワークアクセスをデフォルトで遮断し、オフラインでも安定動作。【F:.qa/README.md†L3-L30】【F:.qa/qa.config.ts†L54-L91】
- 画面フローの BFS クロールと到達不能ページの検出、リンク修正リスト生成。【F:.qa/README.md†L70-L104】
- 時間制限付き探索的テスト（未訪問優先の guided も選択可）。【F:.qa/README.md†L32-L66】【F:.qa/README.md†L91-L104】
- 成果物（フロー図、分析、探索ログ）を `docs/qa` へ公開可能。【F:.qa/README.md†L47-L104】

## 2. クイックスタート
1. 依存解決と Playwright ブラウザの導入・スクリプト生成: `bash .qa/setup.sh`。【F:.qa/setup.sh†L16-L62】
2. ルート定義: `.qa/routes.txt` に 1 行 1 ルートで追加します（初期値は `/` のみ）。【F:.qa/README.md†L17-L18】
3. 最低限の回し方:
   - スクリーンショット: `npm run qa:shots`。【F:.qa/README.md†L9-L15】
   - ビジュアルリグレッション（初回はベースライン作成）: `npm run qa:visual:update` → 以降 `npm run qa:visual`。【F:.qa/README.md†L9-L15】

## 3. 画面フロー・カバレッジ系
### 主なコマンド
- フロー生成のみ: `npm run qa:flow`（`docs/qa` へも出したい場合は `npm run qa:flow:publish`）。【F:.qa/README.md†L35-L50】【F:.qa/README.md†L72-L76】
- 到達不能分析 + リンク修正リスト: `npm run qa:flow:analyze`（公開付きは `npm run qa:flow:analyze:publish`）。【F:.qa/README.md†L78-L83】
- 探索的テスト（ランダム）: `QA_EXPLORE_SECONDS=120 npm run qa:explore`。【F:.qa/README.md†L52-L66】
- 探索的テスト（未訪問優先 guided）: `QA_EXPLORE_SECONDS=120 npm run qa:explore:guided`（`QA_EXPLORE_PUBLISH=1` で JSON を `docs/qa` へ）。【F:.qa/README.md†L91-L104】
- まとめて実行（推奨）: `bash .qa/run-flow-coverage.sh`。【F:.qa/README.md†L96-L104】

### 生成物の例
- `.qa/artifacts/flow/` 配下: `screen-flow.md|json` などの中間成果物。【F:.qa/README.md†L47-L50】
- `docs/qa/` 配下: `screen-flow.*`, `flow-analysis.*`, `link-fix-list.md`, `guided-coverage.json`, `QA_POCKET_RUNLOG.md` など公開用成果物（本リポジトリにもサンプルが同梱）。【F:.qa/README.md†L99-L104】【F:docs/qa/flow-analysis.md†L1-L200】
- ビジュアル比較レポート: `.qa/artifacts/playwright-report/`（HTML）。【F:.qa/README.md†L20-L24】

## 4. 環境変数・設定
- プロファイル / ポート: `QA_PROFILE=next|vite|generic`, `QA_PORT`, `QA_BASE_URL` で自動検知を上書き可能。【F:.qa/README.md†L25-L29】【F:.qa/qa.config.ts†L54-L133】
- 開発サーバー起動コマンドの強制指定: `QA_WEB_CMD="..."`。【F:.qa/README.md†L25-L29】【F:.qa/qa.config.ts†L135-L159】
- 外部アクセス制御: `QA_BLOCK_EXTERNAL=0` で許可、`QA_STRICT_EXTERNAL=1` でブロック検出時に失敗にする。【F:.qa/README.md†L25-L30】【F:.qa/qa.config.ts†L175-L179】
- 探索系パラメータ: `QA_FLOW_START_PATH`, `QA_FLOW_MAX_PAGES`, `QA_FLOW_MAX_DEPTH`, `QA_EXPLORE_SECONDS`, `QA_EXPLORE_SEED` などで挙動を調整。【F:.qa/README.md†L41-L45】【F:.qa/README.md†L52-L66】

## 5. サンプル運用フロー
1. `bash .qa/setup.sh` を実行して依存を揃え、生成された `npm run qa:*` スクリプトを確認します。【F:.qa/setup.sh†L16-L62】【F:.qa/setup.sh†L195-L204】
2. `.qa/routes.txt` に主要画面を列挙。
3. `npm run qa:visual:update` でベースラインを作り、変更のたびに `npm run qa:visual` で差分確認します。【F:.qa/README.md†L9-L15】
4. リンク切れや到達不能の検出が必要なタイミングで `bash .qa/run-flow-coverage.sh` を回し、`docs/qa` に生成された `link-fix-list.md` などをレビューします。【F:.qa/README.md†L96-L104】【F:docs/qa/link-fix-list.md†L1-L200】
5. 仕様調査やリグレッション不安時には探索的テストを追加実行し、`docs/qa/guided-coverage.json` を共有します。【F:.qa/README.md†L91-L104】【F:docs/qa/guided-coverage.json†L1-L200】

## 6. 他リポジトリへの導入手順
1. `.qa` フォルダ一式をコピー（`setup.sh`・`setup-flow-coverage.sh` などを含む）。
2. 対象リポジトリのルートで `bash .qa/setup.sh` を実行し、Playwright と Chromium をインストールしてポケット構成と `package.json` の `qa:*` スクリプトを自動追加します。`package.json` がない場合はエラーになるため事前に作成してください。【F:.qa/setup.sh†L16-L62】【F:.qa/setup.sh†L195-L204】
3. フロー/カバレッジ拡張を使う場合は `bash .qa/setup-flow-coverage.sh` を追加実行し、`.qa/known-routes.txt` を整備します。【F:.qa/setup-flow-coverage.sh†L1-L47】【F:.qa/setup-flow-coverage.sh†L106-L145】
4. `.qa/artifacts/` は自動的に `.gitignore` 登録済み、`docs/qa/` はコミット対象になる点に注意してください。【F:.qa/setup.sh†L59-L63】【F:.qa/README.md†L99-L104】

## 7. 注意点・ベストプラクティス
- 実行中は外部サイトへのアクセスが遮断されるため、外部 API に依存する画面はモック化か `QA_BLOCK_EXTERNAL=0` の一時的解除を検討してください。【F:.qa/qa.config.ts†L175-L179】
- 初回のビジュアルテストでは必ずベースラインを更新してから比較を行うこと（`qa:visual:update` → `qa:visual`）。【F:.qa/README.md†L9-L15】
- フロー探索はデフォルトで 200 ページ / 深さ 10 を上限とするため、大規模サイトでは `QA_FLOW_MAX_PAGES` や `QA_FLOW_MAX_DEPTH` の調整を推奨します。【F:.qa/README.md†L41-L45】
- 成果物をレポートとして共有する際は `docs/qa/QA_POCKET_RUNLOG.md` を添付すると実行履歴を追いやすくなります。【F:.qa/README.md†L99-L104】

## 8. トラブルシューティング
- Playwright のブラウザインストールで失敗した場合、自動で `--with-deps` なしのリトライを行います（それでも失敗する場合は OS の依存パッケージを確認してください）。【F:.qa/setup.sh†L48-L57】
- サーバー起動コマンドがうまく検知されない場合は `QA_WEB_CMD` に直接コマンドを指定してください。【F:.qa/qa.config.ts†L135-L159】
- 外部リクエストブロックでテストが失敗する場合は、ログに付与される `blocked-requests.txt` を確認し、必要に応じて `QA_STRICT_EXTERNAL=0` に下げてください。【F:.qa/qa.config.ts†L175-L179】【F:.qa/tests/_support/test.ts†L1-L48】
