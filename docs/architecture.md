# アーキテクチャ概要

このドキュメントは、サイトジェネレーターにおける基本用語をまとめています。

- **experience**: 共通の目的を持つページやフローの集合。
- **pageType**: エクスペリエンス内でページのレイアウトや目的を表すカテゴリ。
- **contentId**: 特定のコンテンツアセットを見つけたり参照したりするための識別子。
- **routes.json**: エクスペリエンスで利用可能なルートを記述したマニフェスト。

## データ属性の取り決め

ジェネレーターが生成するマークアップにはデータ属性が付与され、ハイドレーションや
クライアントサイドのナビゲーションが正しいアセットを解決できるようになっています。

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
