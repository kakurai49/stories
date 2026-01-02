# SITECHAIN_FIX_PLAN

## 原因仮説（証拠ベース）
- 生成物の href はすべてページディレクトリ基準の相対パスで出力されている（nav と episodes の href を `router.href_for_page(..., base)` で計算）【F:sitegen/build.py†L251-L341】。
- `relative_route` / `href_from` が末尾スラッシュ無しの URL を「ファイル」とみなして親ディレクトリに遡るため、`posts/ep01/` → `/nagi-s1/generated/posts/ep01` のように hina セグメントが脱落する【F:sitegen/routing.py†L17-L33】。
- 実 HTML では `href="posts/ep01/"` / `href="list/"` が確認でき、brokenResolvedPath では hina を失ったパスに落ちている（docs/qa/sitechain-link-evidence.json と `docs/qa/img/sitechain-nagi-s1_generated_hina.png` / `nagi-s1/generated/hina/index.html` 参照）。
- `/nagi-s1/generated/` に index が無く、python -m http.server のディレクトリ listing がそのまま露出し `_buildinfo.json` などが親パス解釈で 404 へ流れている（sitechain-link-evidence.json: target `/nagi-s1/_buildinfo.json`）。

## 修正方針候補
1. **出力ルート起点の絶対 href を吐く**
   - `relative_route` / `href_from` を out_root 基準のルートパス（例: `/{ctx.out_root.name}/{spec.url_path}`）に切り替え、nav/episode/CTA も同一ロジックを使用。
   - routes_href も out_root 基準に統一し、switcher.js が常に hina/immersive/magazine を含むパスへ遷移するようにする。
2. **ベース URI の明示 or リダイレクト**
   - 各 generated テンプレートに `<base href="./">` もしくは out_root 基準の base を埋め込むことで、末尾スラッシュ欠落時でもディレクトリ解決を固定化。
   - `/nagi-s1/generated/index.html` を生成し、ディレクトリ listing ではなく canonical なトップまたはリダイレクトを返すようにする。
3. **相対運用を続ける場合のガード**
   - `relative_route` にオプションを追加し、ベース URL がスラッシュで終わらない場合でも directory-style 解決を強制する（例: base を `f\"{base}/\"` に正規化）。

## 修正対象ファイル（優先度順）
- `sitegen/routing.py`（relative_route / href_from の計算方法）
- `sitegen/build.py`（nav/episodes/CTA の href と routes_href 生成）
- `experience_src/*/templates/*.jinja`（必要に応じて `<base>` 追加）
- `generated` 出力ルート（index.html 生成でディレクトリ listing を抑止）

## 検証プラン
- `bash .qa/run-flow-coverage.sh` でフローとリンク解析を再生成し、broken が 0 になることを確認。
- `npm run qa:sitechain:evidence` で brokenResolvedPath が消え、hrefRaw/ resolved が一致していることを確認。
- `/nagi-s1/generated` へ直接アクセスし、ディレクトリ listing が出ずに想定のリダイレクト/トップページが返ることを目視確認。
