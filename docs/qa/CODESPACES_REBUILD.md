# Codespaces Rebuild Guide

This guide explains how to rebuild the Codespaces container and restore the QA environment with minimal manual work.

## Rebuild the container
1. In VS Code or the Codespaces UI, choose **Rebuild Container** (aka **Rebuild Now**).
2. Wait for the container to recreate. The devcontainer will automatically run the post-create script.

## What runs automatically after rebuild
- Uses the Playwright base image (`mcr.microsoft.com/playwright:v1.57.0-jammy`) with browsers preinstalled.
- Executes `.devcontainer/post-create.sh`, which:
  - Installs project dependencies via pnpm/yarn/npm with frozen lockfiles when available.
  - Skips Playwright browser downloads by default; only installs browsers if missing.
  - Runs `.qa/setup-flow-coverage.sh` (and `.qa/setup.sh` if the QA config is absent) to prepare QA Pocket assets.
  - Prints the next recommended command to run.

## If something fails
- Re-run the setup manually:
  ```bash
  bash .devcontainer/post-create.sh
  ```
- If dependencies are missing, install them with your package manager (pnpm/yarn/npm).
- If Playwright reports missing browsers, run:
  ```bash
  npx playwright install --with-deps
  ```
- If QA setup artifacts are missing, you can also execute:
  ```bash
  bash .qa/setup-flow-coverage.sh
  ```

## Verifying the QA workflow
Run the full flow/coverage sequence (publishes docs under `docs/qa/`):
```bash
bash .qa/run-flow-coverage.sh
```

Alternatively, the fixlist shortcut combines flow generation and analysis:
```bash
npm run qa:fixlist
```

Successful runs will update or generate artifacts under `.qa/artifacts/` (ignored) and documentation under `docs/qa/`.
