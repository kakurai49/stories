# micro 情報構造生成アーキテクチャ レポート

## 目的
インプット Markdown（Season2/3 の台本）から micro 形式の情報構造を生成し、そのまま Jinja テンプレートをレンダリングする v2 フローのアーキテクチャをまとめる。

## パイプライン全体
1. **Markdown → micro store 生成**
   - スクリプト: `scripts/markdown_to_micro_v2.py`
   - 入力: `nagi-s2/nagi-s2.md` / `nagi-s3/nagi-s3.md` の ```text``` フェンス。
   - 処理: フェンスをエピソード単位で抽出 → タイトル/本文分離 → 改行・末尾空白正規化 → 本文 SHA1 を用いたブロック ID（`blk_<hash>`）計算 → `entities/<season-epXX>.json` と `blocks/<id>.json` を生成。
   - 出力: `content/micro/<season>/index.json`（`entity_ids`/`block_ids` を順序付きで保持）。

2. **micro store ロードと検証**
   - 実装: `sitegen/micro_store.py`
   - 検証項目:
     - `index.json` / `entities/` / `blocks/` の存在確認。
     - `index.json` 記載の ID と各ファイルの `id` が一致すること。
     - ブロック指紋（`block_id_from_block`）の再計算で ID が再現できること。
     - `body.blockRefs` がすべて既存ブロックを参照していること。
     - 余剰ファイル（index にない entity/block）がないこと。
   - ロード後は `MicroStore.iter_posts` で index の順序通りにエンティティを列挙。

3. **micro → HTML コンパイル**
   - 実装: `sitegen/compile_pipeline.py` の `compile_store_v2`
   - 処理: blockRefs を解決 → DOM 生成 → テーマ適用して `micro.css` テキスト取得 → HTML 文字列化。
   - 出力: `CompiledStore`（`posts` と `css_text`）。legacy JSON は生成しない。

4. **サイト生成（Jinja レンダリング）**
   - 実装: `sitegen/build.py` の `build_site_from_micro_v2`
   - 流れ: `CompiledStore` を `ContentItem` 等価に変換 → `BuildContext` / `SiteRouter` で home/list/detail を描画 → `micro.css` を `out_root` 直下に書き出す → ルーティング JSON・スイッチャーアセット・`_buildinfo.json` を生成。
   - テンプレート側では detail ページで `micro.css` を相対参照（home/list は従来どおり）。

5. **CLI / 自動化**
   - メイン CLI: `sitegen/cli_build_site.py`
     - 主要オプション: `--micro-store`, `--experiences`, `--src`, `--out`, `--shared`, `--check` など。
     - `--check` 指定時は2回ビルドしてハッシュ比較し、決定性を検証。
   - ワンコマンド: `scripts/build_preview_v2.py`
     - Season 単位で Markdown → micro → HTML を実行し、必要に応じて出力を alias ディレクトリへコピー。

## 主要データ構造
- **micro store**: `index.json`（`entity_ids`/`block_ids`）、`entities/*.json`（meta/relations/body.blockRefs を含む）、`blocks/*.json`（Markdown または HTML ブロック）。
- **CompiledStore**: `posts`（entity ごとの HTML とメタデータ）、`css_text`（micro.css 内容）。
- **生成物**: HTML（home/list/detail）、`micro.css`、`routes.json`、スイッチャー関連アセット、`_buildinfo.json`。

## 実行例
```bash
# micro 生成（nagi-s2）
python scripts/markdown_to_micro_v2.py \
  --input nagi-s2/nagi-s2.md \
  --out content/micro/nagi-s2 \
  --season nagi-s2 \
  --variant hina \
  --expected-blocks 13 \
  --force

# micro から HTML ビルド（決定性チェック付き）
python -m sitegen.cli_build_site \
  --micro-store content/micro/nagi-s2 \
  --experiences config/experiences.yaml \
  --src experience_src \
  --out nagi-s2/generated_v2 \
  --shared \
  --deterministic \
  --check
```
