# stories
時間や気持ち、環境などの流れを言葉にしたものの集合

## ローカル開発環境セットアップ
- Codespaces / devcontainer 設定は現状ありません。ローカルでは Python 3.11 系での動作を確認しています（`python -V` で確認してください）。
- 依存関係は `requirements.txt` を `pip` で導入します。仮想環境はリポジトリ直下の `.venv/` を使用してください（`.gitignore` 済み）。

### 1. 仮想環境の作成と依存導入
クロスプラットフォームのセットアップスクリプトを用意しています。

**macOS / Linux**
```bash
python -V  # 3.11 系を推奨
python scripts/bootstrap_venv.py
source .venv/bin/activate
```

**Windows (PowerShell)**
```powershell
python -V  # 3.11 系を推奨
python scripts/bootstrap_venv.py
.\\.venv\\Scripts\\activate
```

### 2. 実行・テスト
仮想環境を有効化した状態で、既存のコマンドをそのまま使えます。
- コンテンツ検証: `python -m sitegen validate --experiences config/experiences.yaml --content content/posts`
- サイト生成: `python -m sitegen build --experiences config/experiences.yaml --src experience_src --out generated --content content/posts --all`
- テスト: `python -m pytest`

### 補足
- `.venv/` は既に Git で無視されています。ローカルに作成した仮想環境やキャッシュをコミットしないでください。

## 公開ルートとシーズン構成
- GitHub Pages の公開ルートはリポジトリ直下（`/`）を前提としています（専用ワークフローは未設定）。
- トップページはシーズン一覧（`/index.html`）で、実体は `nagi-s1/`・`nagi-s2/`・`nagi-s3/` のサブディレクトリに分割しました。
  - 既存の物語と生成物は `nagi-s1/` に移動済みです（`nagi-s1/index.html` や `nagi-s1/story1.html`、`nagi-s1/generated/...`）。
  - 共通で再利用する CSS/JS は `assets/` に配置します（シーズン間での重複を避ける運用）。
- ローカル確認例:
  ```bash
  python -m http.server 8000 --directory .
  # http://localhost:8000/         (シーズン一覧)
  # http://localhost:8000/nagi-s1/ (既存シーズン1の入り口)
  ```

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
基本的な出力先は `generated/`（`--out` で変更可。公開時は `nagi-s1/generated/` を推奨）です。`--all` を付けると `routes.json` やスイッチャー用アセット、レガシー HTML のパッチもまとめて生成します。
```bash
python -m sitegen build \
  --experiences config/experiences.yaml \
  --src experience_src \
  --out nagi-s1/generated \
  --content content/posts \
  --all \
  --legacy-base nagi-s1
```

### micro store から直接ビルドする（v2）
legacy JSON (`content/posts/*.json` や `dist/posts/*.json`) を介さず、micro store からそのままテンプレートを描画するフローです。`--check` を付けると同一入力で 2 回ビルドし、HTML と `micro.css` のハッシュ一致を自動検証します。
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

- nagi-s2 / nagi-s3 の markdown から micro / HTML を作る場合（v2 フロー）:
  1. **加工設計（v2）**
     - 13 本のストーリーはすべて ```text``` コードフェンス内にあり、各フェンスを Markdown ブロックとして扱う。
     - ブロックは fingerprint ベースの ID（`blk_<sha1>`）で保存し、エンティティは `<season>-epXX` で連番化。`variant` は既存テンプレート互換の `hina` を前提とする。
     - `meta.title` は各フェンスの最初の非空行、`meta.summary` は本文を 140 文字に圧縮したダイジェスト、`meta.tags` は `["story", "episode", <season>]`（必要に応じて追加タグを渡す）とする。
     - `relations` には `{"season": <season>, "index": <order>}` を入れて順序を保持。`body.blockRefs` は生成したブロック ID を 1 つ持つ。
  2. **micro ストアを生成する**（必要に応じて `--season` を `nagi-s2` / `nagi-s3` に切り替える）
     ```bash
     python scripts/markdown_to_micro_v2.py \
       --input nagi-s2/nagi-s2.md \
       --out content/micro/nagi-s2 \
       --season nagi-s2 \
       --variant hina \
       --expected-blocks 13 \
       --force
     # nagi-s3 版
     python scripts/markdown_to_micro_v2.py \
       --input nagi-s3/nagi-s3.md \
       --out content/micro/nagi-s3 \
       --season nagi-s3 \
       --variant hina \
       --expected-blocks 13 \
       --force
     ```
     - 13 本未満／超過ならエラーで停止する。`--tag` を複数指定すると任意タグを追加できる。
  3. **micro から HTML をビルドする（v2）**
     ```bash
     python -m sitegen.cli_build_site \
       --micro-store content/micro/nagi-s2 \
       --experiences config/experiences.yaml \
       --src experience_src \
       --out nagi-s2/generated_v2 \
       --shared \
       --deterministic \
       --check
     ```
     - `--experience hina` などを追加すれば対象体験を絞れる。`--check` 付きなので決定性も同時に検証される。

### 補助コマンド
- 雛形生成: `python -m sitegen scaffold --experiences config/experiences.yaml --src experience_src --out-root generated`
- manifest 出力: `python -m sitegen gen-manifests --experiences config/experiences.yaml --src experience_src`
- プラン文書化: `python -m sitegen plan export-docs --in config/experiment.yaml --out docs/experiment.md`
