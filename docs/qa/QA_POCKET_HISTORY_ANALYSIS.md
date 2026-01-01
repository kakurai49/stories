# QA Pocket ドキュメント履歴レビューと強化提案

## 1. 調査対象
- `docs/qa/` 配下の運用ドキュメント・自動生成レポート（`screen-flow.*`, `flow-analysis.*`, `link-fix-list.md`, `guided-coverage.json`, `QA_POCKET_RUNLOG.md`, `QA_POCKET_MANUAL.md`, `CODESPACES_REBUILD.md`）。

## 2. これまでの更新履歴（git log より）
- 2026-01-02 05:11:52 JST: 「QA flow coverage automation」を追加し、フロー/探索レポートと fixlist を初導入。【コミット: a4f5a9d】
- 2026-01-02 06:05:52 JST: 「QA Pocket portable manual」を追加し、運用ガイドを整備。【コミット: 42480ff】
- 2026-01-02 07:01:25 JST: 「devcontainer setup と Codespaces rebuild 手順」を追加し、自動セットアップと実行ログの更新を実施。【コミット: b725516】

## 3. ドキュメントから読み取れる現状
- フロー構造とリンク欠損: 52 ページ・106 エッジで構成され、`/nagi-s1/generated` 系に dead end 19 件・404 を伴う broken 19 件が集中。【F:docs/qa/flow-analysis.md†L7-L46】【F:docs/qa/link-fix-list.md†L9-L59】
- 外部依存の遮断: KaTeX CDN へのリクエストが大量にブロックされており、オフライン実行でスタイル/描画欠落のリスクが残る。【F:docs/qa/flow-analysis.md†L48-L83】
- 探索カバレッジ: guided explore 60 秒時点で 52 ページ中 16 ページ（約 31%）しか訪問できておらず、`/nagi-s2`・`/nagi-s3` など別モジュールが未踏のまま。【F:docs/qa/guided-coverage.json†L1-L74】
- 実行履歴: 2026-01-01 に同一設定で 2 回回しており、結果は変わらず（到達不能 0・dead end/broken 19）。継続的な回収やルート追加はまだ反映されていない。【F:docs/qa/QA_POCKET_RUNLOG.md†L5-L34】
- 環境・運用面: Codespaces 再構築時に QA Pocket のセットアップとブラウザ準備が自動化され、`run-flow-coverage.sh` を推奨するワークフローが明記されている。【F:docs/qa/CODESPACES_REBUILD.md†L1-L35】

## 4. 弱点と回収状況の推測
- コンテンツ欠落/モック不足: `/nagi-s1/generated/posts/*` や `/nagi-s1/_buildinfo.json` などが 404 を返しており、ビルド済み静的ファイルか API モックが不足している可能性が高い。【F:docs/qa/link-fix-list.md†L17-L59】
- ナビゲーション未整備: dead end に戻りリンクや一覧導線がなく、探索やフロー解析が行き止まりで終了している。回収タスクは fixlist に残されたまま進捗がない。【F:docs/qa/link-fix-list.md†L11-L59】
- モジュール間の導線不足: `/nagi-s2`・`/nagi-s3` はフロー図には存在するが探索カバレッジでは未訪問であり、トップページからの導線か探索時間設定が不足。【F:docs/qa/screen-flow.md†L5-L64】【F:docs/qa/guided-coverage.json†L1-L74】
- 外部リソース依存: KaTeX CDN ブロックが多数記録されており、オフライン実行時の描画欠落・テスト不安定化が残る状態。【F:docs/qa/flow-analysis.md†L48-L83】

## 5. 追加機能によるシナジー
- フロー/カバレッジ自動化（`qa:fixlist`）と portable manual により、誰でも同じ手順で欠損リンクと到達不能を検出・共有できる。
- Codespaces 再構築ガイドが devcontainer の自動セットアップと連携し、ブラウザ/QA スクリプト準備を省力化することでレポート更新のハードルを下げている。【F:docs/qa/CODESPACES_REBUILD.md†L7-L35】
- レポート公開 (`docs/qa/` コミット) により、フロー図・分析・探索ログが履歴として残り、改善効果を追跡しやすい運用が整備された。

## 6. 今後の強化提案
1) コンテンツ/モック整備
- `/nagi-s1/generated/posts/*` 群と JSON/共有ファイルを生成またはモック化し、404 を解消。最低限、ダミー HTML/JSON を配置してリンク切れをなくす。

2) ナビゲーション改善
- dead end ページに「一覧へ戻る」「次の記事へ」などの導線を追加し、out-degree を 1 以上にする。併せて `link-fix-list.md` の TODO を減らす。

3) モジュール導線と探索カバレッジ拡張
- ルート定義 `.qa/routes.txt` とトップ/索引ページに `/nagi-s2`・`/nagi-s3` へのリンクを追加し、guided explore が別モジュールも訪問できるようにする。探索時間 (`QA_EXPLORE_SECONDS`) を 120 秒などへ拡大し、複数シードで安定度を測定。

4) 外部リソースのローカル化
- KaTeX など CDN 依存をローカルコピーに切り替え、`QA_BLOCK_EXTERNAL` を有効のままでもスタイルが崩れないようにする。

5) 継続的モニタリング
- `QA_POCKET_RUNLOG.md` に各実行での dead end / broken 件数と主な修正内容を追記し、改善トレンドを可視化。`qa:flow:analyze:publish` を CI に組み込み、回収の抜け漏れを防止。
