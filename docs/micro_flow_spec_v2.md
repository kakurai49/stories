# micro → Jinja v2 フロー仕様（micro store 直結版）

新しい標準フローは `content/posts/*.json` を経由せず、micro store（`index.json` + `entities/` + `blocks/`）から直接 Jinja テンプレートをレンダリングする。従来の legacy JSON 生成（`dist/posts/*.json`）は移行期間のため `sitegen.cli_build_posts` に残しつつ、v2 では呼び出さない。

## 役割分割
- **MicroStore.load**: `index.json` に記載された `entity_ids`/`block_ids` を必須とし、ID ミスマッチ・指紋不一致・参照欠落を厳密に検証する。余剰ファイルもエラー扱いにすることで入力の揺れを防止する。【F:sitegen/micro_store.py†L17-L114】
- **compile_store_v2**: micro エンティティの `blockRefs` を解決し、DOM を HTML に変換した `CompiledStore`（`posts` と `css_text`）を返す。ファイル出力は行わず、v1 の legacy JSON 生成 (`emit_legacy`) と分離している。【F:sitegen/compile_pipeline.py†L138-L199】
- **build_site_from_micro_v2**: `CompiledStore` を `ContentItem` 等価の view-model に変換し、`BuildContext`/`SiteRouter` で home/list/detail をレンダリングする。micro.css を出力し、StrictUndefined な Jinja に直接データを供給する。【F:sitegen/build.py†L50-L117】【F:sitegen/build.py†L406-L495】
- **CLI: sitegen.cli_build_site**: `--micro-store` を入力に、テンプレート (`--src`) と experiences.yaml を指定して v2 ビルドを実行する。`--check` で同一入力の 2 回ビルドを自動実行し、出力ハッシュが一致しなければ失敗する。出力は HTML + micro.css のみ（legacy JSON は生成しない）。【F:sitegen/cli_build_site.py†L1-L140】

## 実行例
```bash
python -m sitegen.cli_build_site \
  --micro-store content/micro \
  --experiences config/experiences.yaml \
  --src experience_src \
  --out generated_v2 \
  --shared \
  --deterministic \
  --check
```
- `--deterministic` と `SOURCE_DATE_EPOCH` によりビルドラベルが安定し、`--check` で 2 回ビルドした成果物（HTML と micro.css）のハッシュ一致を確認する。
- `--experience <key>` を複数指定すると対象体験を絞り込める。

## 移行上の注意
- v2 では `content/posts/*.json` を読まない／`dist/posts/*.json` を書かない。legacy JSON が必要な場合のみ `sitegen.cli_build_posts` を使う。
- `micro.css` を `out_root` に書き出し、detail テンプレート側で相対パス読み込みを追加済み（home/list は従来どおり）。【F:sitegen/build.py†L437-L495】【F:experience_src/hina/templates/detail.jinja†L10-L15】
- `MicroStore.iter_posts` は `index.json` の順序を保持するため、決定性チェックは micro 入力の順序に従って行われる。余剰ファイルや参照欠落は早期にエラーになる。
