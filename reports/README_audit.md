# 監査の再現手順

## 前提
- 作業ディレクトリ: リポジトリルート（`/workspace/stories` を想定）
- Python 3.11+
- 依存インストール済み: `python -m pip install -r requirements.txt`

## 実行コマンド
1. コンテンツと設定の検証
   ```bash
   python -m sitegen validate --experiences config/experiences.yaml --content content/posts
   ```
2. 生成物のビルド（GitHub Pages 公開物を想定した `generated/` 出力）
   ```bash
   python -m sitegen build \
     --experiences config/experiences.yaml \
     --src experience_src \
     --out generated \
     --content content/posts \
     --all
   ```
3. 出力ファイル一覧の取得（レポート参照用）
   ```bash
   find generated -maxdepth 3 -type f | sort > reports/out_files.txt
   ```
4. 監査スクリプトの実行（JSON / Markdown レポート生成）
   ```bash
   python scripts/audit_generated_site.py \
     --out generated \
     --routes generated/routes.json \
     --experiences config/experiences.yaml \
     --content content/posts
   ```

## 追加メモ
- GitHub Actions / Pages 用のワークフローが見当たらないため、公開ルートはビルド既定の `generated/` を前提に監査しています。
- Playwright 探索は未実施。必要であれば `python -m http.server 8000 --directory generated` でローカルサーバを立ち上げ、別途 Playwright スクリプトを用意してください。
