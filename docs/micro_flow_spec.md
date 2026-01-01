# サイト生成フロー仕様（micro 変換対応）

本資料は、オリジナルサイトの情報構造を取得・整形して JSON 化し、Jinja テンプレートへ流し込んで新しいサイトを生成するまでの一連の流れを仕様としてまとめる。併せて、コンテンツを micro 形式へ変換する新フローの変更点を記述する。

## 全体フロー概要

1. **情報構造の抽出と整形**: 既存サイト（または既存 JSON 群）から情報構造を抽出し、`ContentItem` として妥当性検証を通した JSON (`content/posts/*.json`) を得る。【F:sitegen/build.py†L118-L137】
2. **micro 形式へのスナップショット生成**: legacy JSON から micro エンティティとブロックを生成し、`entities/` と `blocks/` に正規化して保存、`index.json` で ID 一覧を保持する。【F:sitegen/verify_roundtrip.py†L15-L58】【F:sitegen/snapshot_micro.py†L20-L59】
3. **micro ストアのコンパイル**: micro ストアを読み込み、ブロックを DOM に再構成して HTML を吐き出す legacy 互換 JSON (`dist/posts/*.json`) と `micro.css` を生成する。【F:sitegen/micro_store.py†L13-L37】【F:sitegen/compile_pipeline.py†L15-L170】
4. **テンプレートレンダリング**: Jinja 環境をエクスペリエンスごとに構築し、ホーム/一覧/詳細テンプレートへ view model を供給して最終 HTML を出力する。【F:sitegen/build.py†L90-L100】【F:sitegen/build.py†L340-L522】

## 処理ステップと関数フロー

### 1. 情報構造の整形（legacy JSON 準備）
- `load_content_items` が `content/posts/*.json` を走査し、`ContentItem` スキーマで妥当性を保証する。欠落や型不正はビルド前に失敗させる。【F:sitegen/build.py†L118-L137】
- ビルド時は `_group_content`・`build_view_model_for_experience` がページタイプごとにエピソード/紹介/キャラクター/サイトメタへ振り分け、テンプレートで未定義アクセスを防ぐ view model を構築する。【F:sitegen/build.py†L148-L338】

### 2. micro 形式への変換と検証
- `legacy_to_micro` が render.kind（html/markdown）を micro ブロックへ分割し、meta 情報を `entity.meta` に移送、本文は `body.blockRefs` でブロック ID を参照する。【F:sitegen/verify_roundtrip.py†L15-L58】
- `legacy_dir_to_micro_snapshot` は legacy ディレクトリを一括で変換し、エンティティとユニークなブロックをソートして ID 一覧 (`index.json`) を構成する。【F:sitegen/snapshot_micro.py†L20-L59】
- `verify_roundtrip_all` は micro → legacy の往復結果を比較し、差分を unified diff で報告して変換の健全性を担保する。【F:sitegen/verify_roundtrip.py†L61-L114】
- CLI `sitegen.cli_snapshot_micro` で `--posts`（入力）と `--out`（micro 出力）を指定し、`--check` でスナップショット差分と往復一致を同時に検証する。【F:sitegen/cli_snapshot_micro.py†L14-L49】

### 3. micro ストアからのコンパイル
- `load_micro_store` が `blocks/` と `entities/` を読み込み、ID で即座にブロックを引けるストアを構築する。【F:sitegen/micro_store.py†L13-L37】
- `build_posts` パイプライン:
  - `resolve_blocks` でエンティティの `blockRefs` を展開し、存在チェックを行う。【F:sitegen/compile_pipeline.py†L15-L22】
  - `_convert_block` と `blocks_to_dom` で micro ブロックを DOM ツリーへ変換し、必要なら Markdown を HTML 化する。【F:sitegen/compile_pipeline.py†L40-L109】
  - `apply_theme` で基本的な micro 用 CSS を生成し、最初のエンティティ処理時に `micro.css` へ書き出す。【F:sitegen/compile_pipeline.py†L111-L134】【F:sitegen/compile_pipeline.py†L152-L170】
  - `emit_legacy` で legacy 互換の JSON へ整形し、`dist/posts/<id>.json` へ保存する。【F:sitegen/compile_pipeline.py†L136-L150】【F:sitegen/compile_pipeline.py†L152-L170】
- CLI `sitegen.cli_build_posts` で `--micro`（ストア入力）と `--out`（dist 出力）を指定すると、上記パイプラインを一括実行する。【F:sitegen/cli_build_posts.py†L11-L17】

### 4. Jinja テンプレートへの流し込み
- `BuildContext.jinja_env` がエクスペリエンス固有テンプレートと共有テンプレートを解決し、`StrictUndefined` で欠損を検出する Jinja 環境を返す。【F:sitegen/build.py†L90-L100】
- `build_home`/`build_list`/`build_detail` が view model とルート情報をテンプレートに渡し、スイッチャー用アセットの参照やビルドラベルを付加した HTML を `generated/<experience>/` 配下へ出力する。【F:sitegen/build.py†L340-L522】

## 変更点: micro 形式への転換

- **中間表現の導入**: 従来は legacy JSON を直接テンプレートに渡していたが、micro エンティティ+ブロックの中間表現を追加し、表現層と構造層を分離した（`legacy_to_micro` → `legacy_dir_to_micro_snapshot`）。【F:sitegen/verify_roundtrip.py†L15-L58】【F:sitegen/snapshot_micro.py†L20-L59】
- **健全性チェックの強化**: スナップショット生成時に `verify_roundtrip_all` と `compare_dirs` により往復一致と差分検出を自動化し、形式変換による欠落や順序揺れを抑制する CLI を提供した。【F:sitegen/cli_snapshot_micro.py†L14-L49】【F:sitegen/verify_roundtrip.py†L61-L114】
- **micro から legacy への自動再構成**: `build_posts` が micro ストアから DOM・CSS を組み立て、legacy 互換 JSON とスタイルを生成するブリッジ層として追加された。これにより、テンプレートレンダリングは既存の `ContentItem` 構造を保ちながら micro 起点のデータを扱える。【F:sitegen/compile_pipeline.py†L136-L170】【F:sitegen/compile_pipeline.py†L152-L170】

