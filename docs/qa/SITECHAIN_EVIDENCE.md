# SITECHAIN_EVIDENCE

## 概要
- 直近のフロー再走: `bash .qa/run-flow-coverage.sh`（docs/qa/screen-flow.json を更新済み）。
- 壊れ一覧生成: `docs/qa/broken-with-referers.json`（screen-flow.json → broken と referer を突合）。
- DOM からの証拠採取: `npm run qa:sitechain:evidence` → `docs/qa/sitechain-link-evidence.json` と `docs/qa/img/sitechain-*.png` を生成。
- 404 は計 19 ターゲット。主に「/nagi-s1/generated/...」配下で hina セグメントが落ちたパスと、/nagi-s1/generated/ 直下のファイルリンク群。

## 壊れ一覧（flow ベースの集計）
- `/nagi-s1/generated/posts/ep01`〜`/ep12`: referer は `/nagi-s1/generated/hina` および `/nagi-s1/generated/hina/list`（各エピソード詳細ページ）から。
- `/nagi-s1/generated/list`: referer は `/nagi-s1/generated/hina` と各エピソード詳細ページ。
- `/nagi-s1/_buildinfo.json`, `/nagi-s1/hina`, `/nagi-s1/immersive`, `/nagi-s1/magazine`, `/nagi-s1/routes.json`, `/nagi-s1/shared`: referer は `/nagi-s1/generated`（ディレクトリ listing）。
- すべての referer で HTTP 応答は 200/301 だが、href 解決後パスの一部が hina を失い 404 側に落ちている（詳しくは evidence に raw / resolved / brokenResolvedPath を記録）。

## 代表ケース（href 生値 → 解決後 URL → ずれの証拠）

### 1) `/nagi-s1/generated/posts/ep01` （referer: `/nagi-s1/generated/hina`）
- DOM 証拠: `<a href="posts/ep01/">…</a>`【F:nagi-s1/generated/hina/index.html†L75-L83】
- href 解決:
  - ブラウザ解決: `/nagi-s1/generated/hina/posts/ep01`
  - `brokenResolvedPath`（referer に末尾スラッシュ無しで解決）: `/nagi-s1/generated/posts/ep01`
- JSON 記録: docs/qa/sitechain-link-evidence.json の該当エントリに raw / resolved / brokenResolvedPath / outerHTML を保存。スクリーンショット: `docs/qa/img/sitechain-nagi-s1_generated_hina.png`。
- 生成ロジック: ルーティングの相対解決は `relative_route` が担当し、末尾スラッシュを欠くと base をファイル扱いして親ディレクトリ解釈になる【F:sitegen/routing.py†L17-L33】。home/list/detail の href は `build_view_model_for_experience` に集約され、そこから nav・CTA・エピソードカードの href が組み立てられる【F:sitegen/build.py†L228-L373】。

### 2) `/nagi-s1/generated/list` （referer: `/nagi-s1/generated/hina`）
- DOM 証拠: ナビと CTA がどちらも `href="list/"`【F:nagi-s1/generated/hina/index.html†L25-L46】。
- href 解決:
  - ブラウザ解決: `/nagi-s1/generated/hina/list`
  - brokenResolvedPath: `/nagi-s1/generated/list`
- JSON 記録: sitechain-link-evidence.json 内の target `/nagi-s1/generated/list` に raw / resolved / brokenResolvedPath / outerHTML を保存。スクリーンショット: `docs/qa/img/sitechain-nagi-s1_generated_hina.png`。
- 生成ロジック: nav_links も list_href も `build_view_model_for_experience` 内で一括生成される【F:sitegen/build.py†L228-L373】。相対解決は `relative_route` のロジックに依存するため、ベース URL がファイル扱いになると hina セグメントが脱落する【F:sitegen/routing.py†L17-L33】。

### 3) `/nagi-s1/_buildinfo.json` （referer: `/nagi-s1/generated`）
- 証拠: ディレクトリ listing の `<a href="_buildinfo.json">_buildinfo.json</a>` が `brokenResolvedPath` として `/nagi-s1/_buildinfo.json` に解決（sitechain-link-evidence.json に raw/outerHTML 記録、スクリーンショット `docs/qa/img/sitechain-nagi-s1_generated.png`）。
- 背景: `/nagi-s1/generated/` に index.html が無く python -m http.server の listing へフォールバック。末尾スラッシュ無しで参照するとリンクが親パス解釈され 404 に落ちる。out_root 直下に置くインデックスはビルド終盤の `write_generated_root_index` で生成する想定【F:sitegen/build.py†L477-L515】。

## まとめ
- すべての 404 は「相対パスを末尾スラッシュ無しの URL で解決した場合」に hina / generated セグメントが脱落することが原因。
- 生成 HTML 自体は存在し、/nagi-s1/generated/hina/... へ到達すれば 200 を返す。リンク生成は `build_view_model_for_experience` に集約されているため、ここで out_root 起点の絶対パスへ寄せれば再発を抑止できる【F:sitegen/build.py†L228-L373】。
- ディレクトリ listing 由来のリンクも同じ問題で親ディレクトリへ解決されている。out_root 直下に index.html を吐き出し、リンクを out_root 基準の絶対パスにすることで防げる【F:sitegen/build.py†L477-L515】。
