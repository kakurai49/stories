# アーキテクチャ概要

このドキュメントは、サイトジェネレーターの入出力・責務境界・拡張点を整理し、リファクタリング時の共通前提を提供します。

## 用語と境界

- **experience**: 共通の目的を持つページやフローの集合。`config/experiences.yaml` の `ExperienceSpec` で定義され、kind により `legacy`/`generated` を切り替えます。
- **pageType**: エクスペリエンス内でページのレイアウトや目的を表すカテゴリ。`ContentItem.pageType` とテンプレート（`home/list/detail`）の対応が前提です。
- **contentId**: 特定のコンテンツを識別するキー。URL やテンプレート参照、`routes.json` の `contentId` に利用します。
- **routes.json**: エクスペリエンスで利用可能なルートを記述したマニフェスト。`RouteMap` スキーマに従い、スイッチャーとデータフェッチの接着面になります。

### システム境界

- **インプット**
  - 体験定義: `config/experiences.yaml`（`ExperienceSpec`）。ルーティングパターンと出力ディレクトリの契約。
  - コンテンツ: `content/posts/*.json`（`ContentItem`）。pageType と render.kind が契約。
  - テンプレート/アセット: `experience_src/<experience>/templates/*.jinja` と `experience_src/<experience>/assets/`、および共有テンプレート `sitegen/templates/`。
  - オプションのメタ: `experience_src/<experience>/manifest.json`（OG/ラベル情報）。
  - CLI フラグ: `sitegen build --all/--shared` などの実行スイッチ。
- **アウトプット**
  - HTML: `generated/<output_dir>/index.html`, `list/index.html`, `posts/<slug>/index.html`。
  - アセット: `generated/<output_dir>/assets/` へのコピーと、共有 `generated/shared/` のスイッチャー/feature 初期化スクリプト。
  - マニフェスト: `generated/routes.json`, `_buildinfo.json`（ビルドメタ）、`sitegen gen-manifests` による `manifest.json`。
  - レガシー補助: `--all` 時に `index.html`/`story1.html` へスイッチャーパッチ。
  - 互換エイリアス: 詳細ページに対する `.html` リダイレクトを自動生成し、旧来の `.html` リンクを吸収。

## モジュール責務

- CLI エントリーポイント: `sitegen/cli.py`。各サブコマンドのパラメータ解析とパイプライン呼び出しを担当。
- ビルド/レンダリング: `sitegen/build.py`。`BuildContext` によるパス解決、コンテンツ集約、Jinja2 での `home/list/detail` レンダリング。
- ルーティング: `sitegen/routing.py`。`SiteRouter` が PageSpec（URL・出力先・テンプレート）を単一ソースとして組み立て、ビルドと `routes.json` を同じ定義から生成。`sitegen/routes_gen.py` は `SiteRouter.routes_payload` を書き出す薄いラッパー。
- 共有アセット: `sitegen/shared_gen.py`。スイッチャー JS/CSS と feature 初期化 JS を生成・配置。
- レガシーパッチ: `sitegen/patch_legacy.py`。既存 HTML に data 属性とスイッチャーを注入。
- スキーマ: `sitegen/models.py`。`ExperienceSpec`/`ContentItem`/`RouteMap` などの型定義と検証。
- FS ユーティリティ: `sitegen/util_fs.py`。`ensure_dir`/`write_text` の薄いラッパー。

## ビルドパス（`sitegen build`）

1. `experiences.yaml` と `content/posts` をロードし、Pydantic で検証（`_load_experiences`, `load_content_items`）。`--all` 時はビルドラベルに git SHA とタイムスタンプを含める。
2. `BuildContext` と `SiteRouter` を構築し、PageSpec の一覧を作成:
   - コンテンツを experience 単位にフィルタリングし、URL・出力パス・テンプレート名を確定。
   - PageSpec を順に `home/list/detail` へレンダリングし、経験ごとにアセットを一度だけコピー。詳細ページには `.html` のエイリアスを合わせて生成。
3. `--all` オプション時:
   - `SiteRouter.routes_payload` を `write_routes_payload` で書き出し `routes.json` を更新。
   - `generate_switcher_assets` で共有 JS/CSS を `.` と `generated/` に展開。
   - `patch_legacy_pages` でレガシー HTML に data 属性とスイッチャーボタンを注入。
4. `_buildinfo.json` にビルドメタデータ（コンテンツ件数や出力パス、書き出しファイル一覧）を記録。

## データ属性の取り決め

ジェネレーターが生成するマークアップにはデータ属性が付与され、ハイドレーションやクライアントサイドのナビゲーションが正しいアセットを解決できるようになっています。

- `data-experience`: 現在の DOM ツリーを所有するエクスペリエンスキー（例: `blog`）。
- `data-page-type`: テンプレートを選択するためのページタイプ（例: `post`）。
- `data-content-id`: バインドされたコンテンツ項目の安定した `contentId`。
- `data-routes-href`: `routes.json` ペイロードへの絶対または相対パス。
  この JSON は `RouteMap` スキーマに従い、各ルートの `href`、`pageType`、`contentId`、
  任意の `dataHref` を列挙します。クライアントコードはこの属性を参照して、URL を
  ハードコードせずにナビゲーションモデルをプリフェッチまたはハイドレートできます。

マークアップでの紐づけ例:

```html
<nav
  data-experience="blog"
  data-page-type="post"
  data-content-id="welcome-post"
  data-routes-href="/config/routes.json"
>
  ...
</nav>
```

参照される `routes.json` の例:

```json
{
  "experience": "blog",
  "version": "1.0",
  "routes": [
    {
      "href": "/stories/welcome-post",
      "pageType": "post",
      "contentId": "welcome-post",
      "dataHref": "/data/routes/welcome-post.json"
    }
  ]
}
```

これらの取り決めにより、ランタイムコンポーネントはビルド時のファイル構成に依存せずに
ルーティングメタデータを発見できます。

## リファクタリングの足場

- **責務ごとの I/O を明文化**: 上記「システム境界」と「ビルドパス」を基準に、関数単位で入力/出力を docstring へ追記し、StrictUndefined に対応する view model のフィールドを列挙する（欠損時のエラー混在を防止）。
- **体験ごとの設定を疎結合化**: `BuildContext` が持つ `shared_*` と experience 固有設定を区別する構造体を導入し、差分のみをビルド時に注入する（future: dataclass で `ExperienceBuildConfig` を切り出す）。
- **ルーティングとレンダリングの分離**: `routes_gen` の出力を build ステップから独立させ、後続の CI で差分を検証しやすくする（例: `sitegen routes` などの分離 CLI）。
- **レガシーパッチのテスト面分離**: `patch_legacy` を純関数化した変換層と、ファイル I/O 層に分割することで、HTML 断片のスナップショットテストを容易にする。
