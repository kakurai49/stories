# Micro snapshot runbook

## 実行コマンド（生成）
```
python -m sitegen.cli_snapshot_micro --posts content/posts --out content/micro
```

## 実行コマンド（検証 --check）
```
python -m sitegen.cli_snapshot_micro --posts content/posts --out content/micro --check
```

## 実行コマンド（テスト）
```
python -m unittest -q
```

## Git コマンド（差分確認/ステージ/コミット/任意push）
```
git status
git add content/micro
git commit -m "Add MicroWorld snapshot (content/micro)"
# 任意:
# git push origin HEAD
```
