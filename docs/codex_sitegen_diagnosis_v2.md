# Sitegen v2 diagnosis report

## A) Baseline
- `git rev-parse --show-toplevel` (exit code: 0)
  - stdout:
``````
/workspace/stories

``````
- `git branch --show-current` (exit code: 0)
  - stdout:
``````
work

``````
- `git rev-parse --short HEAD` (exit code: 0)
  - stdout:
``````
0cb118e

``````
- `git status -sb` (exit code: 0)
  - stdout:
``````
## work
?? scripts/codex_sitegen_diagnose_v2.py

``````
- `cat .gitignore` (exit code: 0)
  - stdout:
``````
.venv/
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
node_modules/
artifacts/
playwright-report/
test-results/
artifacts_bundle.zip

``````
- `git config --get core.excludesfile` (exit code: 1)
- `cat .git/info/exclude` (exit code: 0)
  - stdout:
``````
# git ls-files --others --exclude-from=.git/info/exclude
# Lines that start with '#' are comments.
# For a project mostly in C, the following would be a good set of
# exclude patterns (uncomment them if you want to use them):
# *.[oa]
# *~

``````
- `git status --ignored` (exit code: 0)
  - stdout:
``````
On branch work
Untracked files:
  (use "git add <file>..." to include in what will be committed)
	scripts/codex_sitegen_diagnose_v2.py

Ignored files:
  (use "git add -f <file>..." to include in what will be committed)
	node_modules/

nothing added to commit but untracked files present (use "git add" to track)

``````

## B) 入力Markdownの実在とフェンス数
- `git ls-files | grep -E "nagi-s[23].*\.md$"` (exit code: 0)
  - stdout:
``````
nagi-s2/nagi-s2.md
nagi-s3/nagi-s3.md

``````
- nagi-s2/nagi-s2.md
  - ```text フェンス数: 13 (expected 13, delta 0)
  - 先頭タイトル例:
    - 第1話「涙川ひかり、ぽんこつQA見習いとして爆誕」
    - 第2話「環境構築で即死。でも優しさスクリプトが走る」
- nagi-s3/nagi-s3.md
  - ```text フェンス数: 13 (expected 13, delta 0)
  - 先頭タイトル例:
    - 第1話「炎上テストスイートに降臨するアーキテクト」
    - 第2話「『今まで通りでいい』軍 vs テストピラミッド」

## C) 既存スクリプト/仕様の確認
- scripts/markdown_to_micro_v2.py exists: True
- `python scripts/markdown_to_micro_v2.py --help` (exit code: 1)
  - stderr:
``````
Traceback (most recent call last):
  File "/workspace/stories/scripts/markdown_to_micro_v2.py", line 19, in <module>
    from sitegen.io_utils import write_json_stable
ModuleNotFoundError: No module named 'sitegen'

``````
- docs/micro_flow_spec_v2.md exists: True
- スキーマ説明っぽい行 (最大40行):
  - L23: - `--experience <key>` を複数指定すると対象体験を絞り込める。

## D) micro store の実態
- index.json: {'path': 'content/micro/index.json', 'keys': ['block_ids', 'entity_ids']}
- entities (最大5件):
  - {"path": "content/micro/entities/about-世界観.json", "keys": ["body", "id", "meta", "relations", "type", "variant"], "has_meta": true, "has_relations": true, "has_body": true}
  - {"path": "content/micro/entities/about-読みどころ.json", "keys": ["body", "id", "meta", "relations", "type", "variant"], "has_meta": true, "has_relations": true, "has_body": true}
  - {"path": "content/micro/entities/character-サキュバスメイド喫茶∞.json", "keys": ["body", "id", "meta", "relations", "type", "variant"], "has_meta": true, "has_relations": true, "has_body": true}
  - {"path": "content/micro/entities/character-バルハ.json", "keys": ["body", "id", "meta", "relations", "type", "variant"], "has_meta": true, "has_relations": true, "has_body": true}
  - {"path": "content/micro/entities/character-神崎ナギ.json", "keys": ["body", "id", "meta", "relations", "type", "variant"], "has_meta": true, "has_relations": true, "has_body": true}
- blocks (最大5件):
  - {"path": "content/micro/blocks/blk_1e78e99922d794566e3aaf70bded0e24c815d618.json", "keys": ["html", "id", "type"], "has_meta": false, "has_relations": false, "has_body": false}
  - {"path": "content/micro/blocks/blk_3cdb10bc0c05c0ff06e974d2afc21e78c7a83e0e.json", "keys": ["id", "source", "type"], "has_meta": false, "has_relations": false, "has_body": false}
  - {"path": "content/micro/blocks/blk_560f0674a5713313bd9040ddfdbc86e27a45f2e9.json", "keys": ["id", "source", "type"], "has_meta": false, "has_relations": false, "has_body": false}
  - {"path": "content/micro/blocks/blk_5b98026ac65cbbc96d89da5d1cf4ace19c630ece.json", "keys": ["id", "source", "type"], "has_meta": false, "has_relations": false, "has_body": false}
  - {"path": "content/micro/blocks/blk_6ea791793bd4c34bd86f39c563375e9e53398abf.json", "keys": ["html", "id", "type"], "has_meta": false, "has_relations": false, "has_body": false}

## E) sitegen build スモークテスト
- `python -m sitegen --help` (exit code: 0)
  - stdout:
``````
usage: sitegen [-h] [--version]
               {plan,ia,validate,scaffold,gen-manifests,build} ...

Static site generation utilities

positional arguments:
  {plan,ia,validate,scaffold,gen-manifests,build}
    plan                Experiment plan utilities
    ia                  Information architecture utilities
    validate            Validate experiences.yaml and content posts.
    scaffold            Create scaffolding for generated experiences.
    gen-manifests       Generate manifest.json files for generated
                        experiences.
    build               Build generated experiences.

options:
  -h, --help            show this help message and exit
  --version             Show the sitegen version and exit.

``````
- `python -m sitegen build --help` (exit code: 0)
  - stdout:
``````
usage: sitegen build [-h] [--experiences EXPERIENCES] [--src SRC] [--out OUT]
                     [--content CONTENT] [--routes-filename ROUTES_FILENAME]
                     [--shared] [--all] [--deterministic]
                     [--build-label BUILD_LABEL] [--legacy-base LEGACY_BASE]

Render generated experience templates into output directories.

options:
  -h, --help            show this help message and exit
  --experiences EXPERIENCES
                        Path to experiences.yaml.
  --src SRC             Base directory containing experience source templates.
  --out OUT             Directory to write rendered output.
  --content CONTENT     Directory containing content JSON files.
  --routes-filename ROUTES_FILENAME
                        Filename for routes JSON used to compute data-routes-
                        href.
  --shared              Generate shared assets (e.g., feature bootstrap
                        scripts).
  --all                 Build generated experiences and refresh routes,
                        switchers, and legacy pages.
  --deterministic       Use SOURCE_DATE_EPOCH (or 0) for timestamps to
                        stabilize build outputs.
  --build-label BUILD_LABEL
                        Override the build label appended to outputs (default
                        combines timestamp and git SHA).
  --legacy-base LEGACY_BASE
                        Base directory for patching legacy HTML when --all is
                        set (defaults to the season1 root).

``````
- `python -m sitegen.cli_build_site --help` (exit code: 0)
  - stdout:
``````
usage: cli_build_site.py [-h] --micro-store MICRO_STORE
                         [--experiences EXPERIENCES] [--src SRC] --out OUT
                         [--routes-filename ROUTES_FILENAME]
                         [--experience EXPERIENCE_KEYS] [--deterministic]
                         [--build-label BUILD_LABEL] [--shared] [--all]
                         [--legacy-base LEGACY_BASE] [--check]

Build site directly from micro store (v2).

options:
  -h, --help            show this help message and exit
  --micro-store MICRO_STORE
                        Path to micro store root directory
  --experiences EXPERIENCES
                        Path to experiences.yaml
  --src SRC             Template source root
  --out OUT             Output directory for rendered site
  --routes-filename ROUTES_FILENAME
                        Filename for routes JSON used to compute data-routes-
                        href.
  --experience EXPERIENCE_KEYS
                        Limit rendering to one or more experience keys
                        (repeatable).
  --deterministic       Use SOURCE_DATE_EPOCH (or 0) for timestamps when
                        composing build labels.
  --build-label BUILD_LABEL
                        Override build label (default combines timestamp and
                        git SHA).
  --shared              Generate shared assets (e.g., feature bootstrap)
                        alongside HTML output.
  --all                 Generate shared assets, switcher routes, and patch
                        legacy pages.
  --legacy-base LEGACY_BASE
                        Base directory for patching legacy HTML when --all is
                        set.
  --check               Run two builds into temporary directories and fail if
                        outputs differ.

``````
- READMEの v2 コマンド実行:
- `python -m sitegen.cli_build_site --micro-store content/micro --experiences config/experiences.yaml --src experience_src --out artifacts/_probe_build_out --shared --deterministic --check` (exit code: 0)
  - stdout:
``````
Built 128 file(s) into /tmp/tmpfzgm55_h/run1
Built 128 file(s) into /tmp/tmpfzgm55_h/run2
Determinism check passed. Output copied to artifacts/_probe_build_out

``````
- 出力先 artifacts/_probe_build_out: {"exists": true, "total_files": 138, "total_size": 523825, "top_files": ["artifacts/_probe_build_out/_buildinfo.json", "artifacts/_probe_build_out/hina/assets/base.css", "artifacts/_probe_build_out/hina/assets/components.css", "artifacts/_probe_build_out/hina/assets/tokens.css", "artifacts/_probe_build_out/hina/index.html", "artifacts/_probe_build_out/hina/list/index.html", "artifacts/_probe_build_out/hina/posts/about-世界観.html", "artifacts/_probe_build_out/hina/posts/about-世界観/index.html", "artifacts/_probe_build_out/hina/posts/about-読みどころ.html", "artifacts/_probe_build_out/hina/posts/about-読みどころ/index.html", "artifacts/_probe_build_out/hina/posts/character-サキュバスメイド喫茶∞.html", "artifacts/_probe_build_out/hina/posts/character-サキュバスメイド喫茶∞/index.html", "artifacts/_probe_build_out/hina/posts/character-バルハ.html", "artifacts/_probe_build_out/hina/posts/character-バルハ/index.html", "artifacts/_probe_build_out/hina/posts/character-神崎ナギ.html", "artifacts/_probe_build_out/hina/posts/character-神崎ナギ/index.html", "artifacts/_probe_build_out/hina/posts/character-結城ユイ.html", "artifacts/_probe_build_out/hina/posts/character-結城ユイ/index.html", "artifacts/_probe_build_out/hina/posts/ep01.html", "artifacts/_probe_build_out/hina/posts/ep01/index.html", "artifacts/_probe_build_out/hina/posts/ep02.html", "artifacts/_probe_build_out/hina/posts/ep02/index.html", "artifacts/_probe_build_out/hina/posts/ep03.html", "artifacts/_probe_build_out/hina/posts/ep03/index.html", "artifacts/_probe_build_out/hina/posts/ep04.html", "artifacts/_probe_build_out/hina/posts/ep04/index.html", "artifacts/_probe_build_out/hina/posts/ep05.html", "artifacts/_probe_build_out/hina/posts/ep05/index.html", "artifacts/_probe_build_out/hina/posts/ep06.html", "artifacts/_probe_build_out/hina/posts/ep06/index.html", "artifacts/_probe_build_out/hina/posts/ep07.html", "artifacts/_probe_build_out/hina/posts/ep07/index.html", "artifacts/_probe_build_out/hina/posts/ep08.html", "artifacts/_probe_build_out/hina/posts/ep08/index.html", "artifacts/_probe_build_out/hina/posts/ep09.html", "artifacts/_probe_build_out/hina/posts/ep09/index.html", "artifacts/_probe_build_out/hina/posts/ep10.html", "artifacts/_probe_build_out/hina/posts/ep10/index.html", "artifacts/_probe_build_out/hina/posts/ep11.html", "artifacts/_probe_build_out/hina/posts/ep11/index.html", "artifacts/_probe_build_out/hina/posts/ep12.html", "artifacts/_probe_build_out/hina/posts/ep12/index.html", "artifacts/_probe_build_out/hina/posts/site-meta.html", "artifacts/_probe_build_out/hina/posts/site-meta/index.html", "artifacts/_probe_build_out/hina/posts/welcome-post.html", "artifacts/_probe_build_out/hina/posts/welcome-post/index.html", "artifacts/_probe_build_out/immersive/assets/base.css", "artifacts/_probe_build_out/immersive/assets/components.css", "artifacts/_probe_build_out/immersive/assets/tokens.css", "artifacts/_probe_build_out/immersive/index.html"], "note": "showing first 50 files of 138"}
- `git check-ignore -v artifacts/_probe_build_out` (exit code: 0)
  - stdout:
``````
.gitignore:7:artifacts/	artifacts/_probe_build_out

``````

## F) 出力先の対照実験 (trackable)
- `python -m sitegen.cli_build_site --micro-store content/micro --experiences config/experiences.yaml --src experience_src --out _probe_build_out_trackable --shared --deterministic --check` (exit code: 0)
  - stdout:
``````
Built 128 file(s) into /tmp/tmpf1z18qo6/run1
Built 128 file(s) into /tmp/tmpf1z18qo6/run2
Determinism check passed. Output copied to _probe_build_out_trackable

``````
- `git check-ignore -v _probe_build_out_trackable` (exit code: 1)
- `git status -sb` (exit code: 0)
  - stdout:
``````
## work
?? _probe_build_out_trackable/
?? scripts/codex_sitegen_diagnose_v2.py

``````

## G) テスト実行
- `python -m pytest -q tests/test_micro_build_site_v2.py` (exit code: 0)
  - stdout:
``````
.                                                                        [100%]
1 passed in 3.41s

``````
- `python -m pytest -q tests/test_micro_flow_e2e.py` (exit code: 0)
  - stdout:
``````
.                                                                        [100%]
1 passed in 4.52s

``````
- `python -m pytest -q tests/test_snapshot_check_mode.py` (exit code: 0)
  - stdout:
``````
.                                                                        [100%]
1 passed in 0.36s

``````
- `python -m pytest -q` (exit code: 0)
  - stdout:
``````
...........................                                              [100%]
27 passed in 10.59s

``````
- `bash scripts/verify_sitegen_flow.sh` (exit code: 0)
  - stdout:
``````
[08:17:33] Working directory: /tmp/sitegen-flow.7LvegE
[08:17:33] Generating micro snapshot
[08:17:33] Verifying snapshot (--check)
[08:17:33] Compiling micro store to dist
[08:17:33] Rendering HTML from dist posts
Built 132 file(s) for 3 experience(s) into /tmp/sitegen-flow.7LvegE/work_generated.
[08:17:35] Generating micro snapshot
[08:17:35] Verifying snapshot (--check)
[08:17:35] Compiling micro store to dist
[08:17:36] Rendering HTML from dist posts
Built 132 file(s) for 3 experience(s) into /tmp/sitegen-flow.7LvegE/work_generated.
[08:17:37] Comparing run1 vs run2 outputs for determinism
[08:17:38] All checks passed.

``````
- 生成物カウント: {"playwright_report_files": 0, "test_results_files": 0}
