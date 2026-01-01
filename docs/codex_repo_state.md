# Codex Repository State

## A) Git/Repo基本情報
### Repo root

- Command: `git rev-parse --show-toplevel`
- Exit code: 0

```
/workspace/stories
```

### Branch

- Command: `git branch --show-current`
- Exit code: 0

```
work
```

### HEAD SHA

- Command: `git rev-parse --short HEAD`
- Exit code: 0

```
6365bb1
```

### git status -sb

- Command: `git status -sb`
- Exit code: 0

```
## work
```

### git remote -v

- Command: `git remote -v`
- Exit code: 0

```
(no output)
```

## B) .gitignore と ignore判定根拠
### .gitignore

- Command: `cat .gitignore`
- Exit code: 0

```
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
```

### git check-ignore -v targets

- Command: `git check-ignore -v artifacts/ artifacts_bundle.zip generated_v2/ dist/ content/micro/ nagi-s2/generated_v2/ nagi-s3/generated_v2/`
- Exit code: 0

```
.gitignore:7:artifacts/	artifacts/
.gitignore:10:artifacts_bundle.zip	artifacts_bundle.zip
```

## C) artifacts の中身概要
### artifacts/ inventory

- Command: python os.walk summary

```
artifacts/ does not exist
```

## D) ビルド経路の手掛かり
### python -m sitegen --help

- Command: `python -m sitegen --help`
- Exit code: 0

```
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
```

### content/micro listing

- Command: `ls -1 content/micro`
- Exit code: 0

```
blocks
entities
index.json
```

### Repository keyword search

- Command: rg (fallback to python walk)

```
--out:
  - README.md
  - docs/MICRO_SNAPSHOT_RUNBOOK.md
  - docs/codex_repo_state.json
  - docs/codex_repo_state.md
  - docs/micro_flow_spec.md
  - docs/micro_flow_spec_v2.md
  - reports/README_audit.md
  - reports/issues_draft.md
  - reports/site_audit.json
  - reports/site_audit.md
  - scripts/audit_generated_site.py
  - scripts/codex_repo_probe.py
  - scripts/markdown_to_micro_v2.py
  - scripts/verify_sitegen_flow.sh
  - sitegen/__pycache__/cli.cpython-311.pyc
  - sitegen/cli.py
  - sitegen/cli_build_posts.py
  - sitegen/cli_build_site.py
  - sitegen/cli_migrate_legacy.py
  - sitegen/cli_snapshot_micro.py
  - tests/test_micro_build_site_v2.py
  - tests/test_micro_flow_e2e.py
  - tests/test_snapshot_check_mode.py
artifacts:
  - /workspace/stories/README_PLAYWRIGHT.md
  - /workspace/stories/docs/codex_repo_state.json
  - /workspace/stories/docs/codex_repo_state.md
  - /workspace/stories/package.json
  - /workspace/stories/playwright.config.ts
  - /workspace/stories/scripts/codex_repo_probe.py
  - /workspace/stories/tests/gh-pages-screenshots.spec.ts
cli_build_site:
  - /workspace/stories/README.md
  - /workspace/stories/docs/codex_repo_state.json
  - /workspace/stories/docs/codex_repo_state.md
  - /workspace/stories/docs/micro_flow_spec_v2.md
  - /workspace/stories/scripts/codex_repo_probe.py
  - /workspace/stories/tests/test_micro_build_site_v2.py
content/micro:
  - /workspace/stories/README.md
  - /workspace/stories/docs/MICRO_SNAPSHOT_RUNBOOK.md
  - /workspace/stories/docs/codex_repo_state.json
  - /workspace/stories/docs/codex_repo_state.md
  - /workspace/stories/docs/micro_flow_spec.md
  - /workspace/stories/docs/micro_flow_spec_v2.md
  - /workspace/stories/scripts/codex_repo_probe.py
  - /workspace/stories/tests/test_micro_build_site_v2.py
generated_v2:
  - /workspace/stories/README.md
  - /workspace/stories/docs/codex_repo_state.json
  - /workspace/stories/docs/codex_repo_state.md
  - /workspace/stories/docs/micro_flow_spec_v2.md
  - /workspace/stories/scripts/codex_repo_probe.py
micro-store:
  - /workspace/stories/README.md
  - /workspace/stories/docs/codex_repo_state.json
  - /workspace/stories/docs/codex_repo_state.md
  - /workspace/stories/docs/micro_flow_spec_v2.md
  - /workspace/stories/scripts/codex_repo_probe.py
  - /workspace/stories/sitegen/cli_build_site.py
  - /workspace/stories/tests/test_micro_build_site_v2.py
```
