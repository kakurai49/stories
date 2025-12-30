# stories
時間や気持ち、環境などの流れを言葉にしたものの集合

## sitegen の概要
`python -m sitegen`（エントリポイントは `sitegen/cli.py`）で静的サイトを生成・検証するツールセットです。生成対象は `config/experiences.yaml` に定義された各エクスペリエンスで、テンプレートは `experience_src/<key>` 配下、コンテンツは `content/posts/*.json` を参照します。ルーティングは `sitegen/routing.SiteRouter` が単一のサイトプランとして組み立て、ビルド・`routes.json`・テンプレートリンクすべてが同じ PageSpec から決定されます。

## sitegen 関数（CLI）の入出力と型
- インプット型
  - `experiences.yaml`: YAML の `list[ExperienceSpec]`。各要素は `key`, `kind`, `output_dir`, `routePatterns` などを持つ（詳細は `sitegen.models.ExperienceSpec`）。
  - コンテンツ JSON: `content/posts/*.json` を `sitegen.models.ContentItem` として読み込む `list[ContentItem]`。`contentId`, `experience`, `pageType`, `render.kind` などを含む。
  - テンプレート・アセット: `experience_src/<experience_key>/templates/*.jinja` と `assets/` 以下の静的ファイル群。
  - 実行フラグ: `--shared`／`--all` などの CLI オプション（`argparse.Namespace`）。
- 処理型
  - `BuildContext` が出力ディレクトリや共有アセットの配置先を決定。
  - `load_content_items` が JSON を `ContentItem` として検証・ロード。
  - 生成対象（kind が `generated`）ごとに `build_home`／`build_list`／`build_detail` が Jinja2（`StrictUndefined` で欠損を検出）で HTML を描画し、アセットをコピー。
  - `--shared` または `--all` 指定時は共有初期化スクリプトを生成。`--all` 指定時は `routes.json`、エクスペリエンス切替用 CSS/JS、レガシー HTML へのパッチも作成。
- アウトプット型
  - `generated/<experience.output_dir>/` 以下の HTML（`index.html`, `list/index.html`, `posts/<slug>/index.html`）。各詳細ページには後方互換用の `.html` リダイレクトも生成されます。
  - 共有アセット: `generated/shared/switcher.{js,css}` と `generated/shared/features/init-features.js`（フラグ次第）。
  - ルーティング定義: `generated/routes.json`。
  - レガシー補助: 既存 `index.html`/`story1.html` を書き換えたファイル（`--all` 時）。

## 処理フロー（sitegen build）
1. `experiences.yaml` とコンテンツ JSON をロードし、`kind == "generated"` の体験のみを対象にする。
2. `BuildContext` と `SiteRouter` が PageSpec を列挙し、テンプレート検索パス・出力パス・URL を一括で決定する。PageSpec をもとにホーム・一覧・詳細ページを描画し、必要に応じて `.html` エイリアスを自動生成。
3. 必要に応じて `shared` アセットや `routes.json` を生成し、レガシーページにスイッチャーボタンとデータ属性を付与。`routes.json` も SiteRouter のサイトプランから直に書き出されるため、HTML・実ファイル・マニフェストの不整合を防ぐ。

## 使い方
### 前提インストール
```bash
python -m pip install -r requirements.txt
```

### コンテンツと設定の検証
エクスペリエンス定義とコンテンツ JSON の整合性をチェックします。
```bash
python -m sitegen validate --experiences config/experiences.yaml --content content/posts
```

### サイト生成（build）
基本的な出力先は `generated/` です。`--all` を付けると `routes.json` やスイッチャー用アセット、レガシー HTML のパッチもまとめて生成します。
```bash
python -m sitegen build \
  --experiences config/experiences.yaml \
  --src experience_src \
  --out generated \
  --content content/posts \
  --all
```

### 補助コマンド
- 雛形生成: `python -m sitegen scaffold --experiences config/experiences.yaml --src experience_src --out-root generated`
- manifest 出力: `python -m sitegen gen-manifests --experiences config/experiences.yaml --src experience_src`
- プラン文書化: `python -m sitegen plan export-docs --in config/experiment.yaml --out docs/experiment.md`
