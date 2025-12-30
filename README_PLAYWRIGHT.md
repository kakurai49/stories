# GitHub Pages 用 Playwright スモークテスト

このリポジトリには、公開された GitHub Pages サイトのフルページスクリーンショットを取得する Playwright ベースのスモークテストが含まれています。

## ベース URL の検出順
`playwright.config.ts` は次の順序で `baseURL` を自動解決します。
1. `BASE_URL` 環境変数（指定された URL をそのまま使用）
2. `gh` CLI とリポジトリ情報が利用できる場合: `gh api repos/{owner}/{repo}/pages --jq .html_url`
3. リポジトリルートの `CNAME` ファイル
4. Git の remote `origin`（または直近コミットの作者の noreply メール） → `https://{owner}.github.io/{repo}/`（リポジトリ名がパターンに一致する場合は `{owner}.github.io`）
5. フォールバック: `https://<repository-name>.github.io/`

ルーティングを安定させるため、末尾のスラッシュを強制します。

## セットアップ
```bash
# 依存関係のインストール
pnpm install

# Playwright のブラウザと Linux 依存関係（ヘッドレス対応）をインストール
pnpm run e2e:install

# 403 などで最初のダウンロード元に拒否された場合も、自動で別 CDN にフォールバックします
```

## スモークテストの実行
```bash
pnpm run e2e   # 実際のコマンド: playwright test --project=chromium
```

出力:
- スクリーンショット: `artifacts/screenshots/`
- テスト結果: `artifacts/test-results/`
- HTML レポート: `artifacts/playwright-report/`

成果物をダウンロード用にまとめる場合:
```bash
zip -r artifacts_bundle.zip artifacts
```

### プロキシ / 制限付きネットワークでの注意点
- プロキシで `github.io` がブロックされている場合は、実行前に到達可能なミラーを `BASE_URL` に設定してください（例: `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/`）。
- 設定は `HTTP_PROXY` / `HTTPS_PROXY` も尊重し、MITM プロキシに対応するため証明書エラーを無視します。
- ローカルでホストして検証したい場合は、`NO_PROXY=127.0.0.1,localhost` を付けてプロキシをバイパスしてください。

## 実行例（ローカルサーバーを使うケース）
GitHub Pages への疎通が遮断される環境だったため、リポジトリ直下を Python の簡易サーバーでホストし、`BASE_URL` を上書きしてテストを実行しました。

```bash
# 1. 別シェルまたはバックグラウンドでローカルサーバーを起動
python -m http.server 8000 --bind 127.0.0.1

# 2. プロキシをバイパスしつつ BASE_URL をローカルに向けてテストを実行
NO_PROXY=127.0.0.1,localhost BASE_URL=http://127.0.0.1:8000/ pnpm run e2e
```

結果として `artifacts/screenshots/` に以下の 3 枚のスクリーンショットが保存され、`artifacts/test-results/` に動画と実行ログが残りました。

- `01_home.png`: `http://127.0.0.1:8000/`
- `02_home.png`: `http://127.0.0.1:8000/#content`
- `03_home.png`: `http://127.0.0.1:8000/#about`
