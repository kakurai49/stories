# stories
時間や気持ち、環境などの流れを言葉にしたものの集合

## ローカル開発環境セットアップ
- Codespaces / devcontainer 設定は現状ありません。ローカルでは Python 3.11 系での動作を確認しています（`python -V` で確認してください）。
- 依存関係は `requirements.txt` を `pip` で導入します。仮想環境はリポジトリ直下の `.venv/` を使用してください（`.gitignore` 済み）。

## QA Pocket セットアップ（`.qa/setup.sh` 実行後の使い方）
`.qa/setup.sh` を 1 回実行すると、Playwright を使ったオフライン寄りの QA ポケット環境が自動構築されます。主に **ローカルでのルートごとのスクリーンショット取得・ビジュアルリグレッション** を簡単に回すためのものです。

- 何が行われるか
  - Playwright と Chromium が devDependencies として追加・インストールされます。
  - `.qa/` 配下に Playwright 設定、共通フィクスチャ、サンプルテスト（スクリーンショット取得・ビジュアル比較）、ルート定義ファイル、成果物ディレクトリが生成されます。
  - `package.json` に QA 系スクリプトが追記されます（`qa:shots`、`qa:visual`、`qa:visual:update`、`qa:test`、`qa:report`）。
  - `.gitignore` に `.qa/artifacts/` が追記され、スクリーンショットやテスト結果はコミット対象外になります（差分比較用スナップショットは `.qa/tests/visual/**-snapshots/` に保存され、こちらはコミット対象）。
  - `.qa/qa.config.ts` でプロファイル検出（Next/Vite/Generic）とポート／ベース URL／dev サーバー起動コマンドを自動判定し、環境変数で上書きできます。
  - 外部ネットワークアクセスをデフォルトで遮断する Playwright フィクスチャが入ります（ベース URL 以外へのリクエストはブロックされ、オプションで厳格エラー化可能）。

- 典型的な使い方
  1. ルート定義を `.qa/routes.txt` に 1 行ずつ書く（`/` だけのままでも可）。
  2. リポジトリ直下で dev サーバーを起動せずに、以下を実行するだけで Playwright が自動で dev サーバーを立ち上げます。
     - スクリーンショット取得: `npm run qa:shots`
     - 初回のビジュアル基準作成: `npm run qa:visual:update`
     - 基準との差分比較: `npm run qa:visual`
  3. 実行結果やレポートは `.qa/artifacts/` 配下に出力されます（HTML レポートは `npm run qa:report` で閲覧）。
  4. dev サーバーのポートやコマンドを変えたい場合は環境変数で上書きできます（例: `QA_PORT=4173 QA_WEB_CMD="npm run dev -- --host 0.0.0.0 --port 4173"`）。

- 良い使い方の例
  - ルートを最小限に絞って高速に比較し、差分が出たら原因を調べる。
  - `QA_BLOCK_EXTERNAL=0` を指定せず、外部リクエストが混ざらないようにした上でビジュアルスナップショットを更新する。
  - Vite/Next など既知プロファイルは自動検出に任せつつ、ポート競合がある場合だけ `QA_PORT` をセットする。

- 良くない使い方の例
  - `.qa/tests/visual/**-snapshots/` を更新せずに差分警告だけを無視する（比較テストが失敗し続ける）。
  - 外部アクセスが必要なまま `QA_STRICT_EXTERNAL=1` をセットし、ブロックされたリクエストでテストを必ず落とす運用にする。
  - `QA_WEB_CMD` を実プロジェクトと異なるコマンドにして、Playwright が立ち上げたサーバーと開発中の挙動がズレる状態でスナップショットを作成する。

より詳細な概要や出力先は `.qa/README.md` も参照してください。

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
- KaTeX 0.16.9 は `assets/katex/0.16.9/` にバンドル済みです。HTML からは `/assets/katex/0.16.9/` を参照し、外部 CDN へのアクセスなしで描画できます。
  - バイナリフォントはリポジトリに含めない（`.gitignore` 済み）ため、CSS からのフォント定義を削除し、システムフォントにフォールバックします。公式フォントを使いたい場合は `assets/katex/0.16.9/fonts/` に手元で取得してください（コミット不要）。

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

### シーズン別のビルド手順と公開パス
- **Season 1（v1 ジェネレート）**
  - ビルド: `python -m sitegen build --experiences config/experiences.yaml --src experience_src --out nagi-s1/generated --content content/posts --all --legacy-base nagi-s1`
  - 公開パス: `/nagi-s1/generated/hina`（末尾スラッシュの有無どちらでも 200）。`/nagi-s1/generated/` にインデックスを置いてディレクトリリスティングを防止し、`/nagi-s1/generated/routes.json` も同梱します。
- **Season 2 / Season 3（v2: micro → HTML）**
  - ワンコマンドビルド（micro 生成 + HTML 決定性検証付き）: `python scripts/build_preview_v2.py --force`。シーズン個別に走らせる場合は `--season nagi-s2` / `--season nagi-s3` を付与。
  - 公開パス（canonical）: `/nagi-s2/generated_v2/hina`、`/nagi-s3/generated_v2/hina`。Phase1 の配信／既存ルートを崩さないため canonical は `generated_v2` のまま維持しています。各直下に `index.html` を生成し、`routes.json` と `shared/`（switcher.js / switcher.css / features init）も同梱。
  - エイリアス（コピー）: `generated_v2` を `generated/` へコピーし、既存リンク互換を確保します。`pnpm run qa:alias:sync` で `/nagi-s2/generated/` と `/nagi-s3/generated/` を更新できます（シンボリックリンクは使用しません）。
  - nagi-s2/nagi-s3 の入口ページは canonical（`generated_v2`）に向けた導線を持ち、後方互換用 alias も明示しています。

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
- `artifacts/` 配下は .gitignore 済みで Codex からは見えないため、プレビュー出力は `nagi-s2/generated_v2` や `nagi-s3/generated_v2` のような git トラッキングされるディレクトリに置くこと。

#### v2 プレビュー用スクリプト
`scripts/build_preview_v2.py` で micro 生成から HTML ビルドまでをワンコマンドで実行できます。出力は git 追跡される `nagi-s2/generated_v2` / `nagi-s3/generated_v2` を使用します。
```bash
python scripts/build_preview_v2.py --force
# 特定シーズンだけ
python scripts/build_preview_v2.py --season nagi-s2 --force
```

- `etc/index.html` を micro v2 に落として HTML 断片も吐き出したい場合（決定性あり）:
```bash
python scripts/html_to_micro_v2.py \
  --input etc/index.html \
  --out content/micro/etc \
  --entity-id etc-home \
  --variant etc \
  --page-type page \
  --compiled-out etc/generated_micro_v2 \
  --force
```
- `content/micro/etc` に micro store（index.json / entities / blocks）、`etc/generated_micro_v2` に `etc-home.html` と `micro.css` が出力される。
- アンカー（`<a href=...>`）が見出しや段落をラップしている場合、ラップしているアンカー自体を `Link` ブロックとして追加し、内側の見出し／段落ブロックはそのまま保持する。ラップではなくインラインの `<a>` は既存通り `InlineLink` に変換される。
- 再生成手順の定石
  1. コンバータを変更したら、上記コマンドで `--force` 付き再生成を実行する。
  2. `content/micro/etc`（store）と `etc/generated_micro_v2`（コンパイル済み HTML/CSS）の両方をコミット対象として確認する。

### 補助コマンド
- 雛形生成: `python -m sitegen scaffold --experiences config/experiences.yaml --src experience_src --out-root generated`
- manifest 出力: `python -m sitegen gen-manifests --experiences config/experiences.yaml --src experience_src`
- プラン文書化: `python -m sitegen plan export-docs --in config/experiment.yaml --out docs/experiment.md`
