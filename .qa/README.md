# QA Pocket (Playwright / Offline / Codespaces)

## What this provides
- Local dev server boot via Playwright `webServer`
- Screenshot capture for routes
- Visual Regression (Playwright snapshots)
- External network requests blocked (offline-friendly)

## Commands (from repo root)
- Capture screenshots:
  - `npm run qa:shots`
- Visual regression (first time: create baselines):
  - `npm run qa:visual:update`
- Visual regression (compare):
  - `npm run qa:visual`

## Routes
Edit `.qa/routes.txt` (1 route per line).

## Artifacts
- Screenshots: `.qa/artifacts/shots/*.png`
- Test results / diffs: `.qa/artifacts/test-results/`
- HTML report: `.qa/artifacts/playwright-report/`

## Env overrides (optional)
- `QA_PROFILE=next|vite|generic`
- `QA_PORT=3000` / `QA_BASE_URL=http://127.0.0.1:3000`
- `QA_WEB_CMD="npm run dev -- --host 0.0.0.0 --port 3000"`
- `QA_BLOCK_EXTERNAL=0` (allow external requests)
- `QA_STRICT_EXTERNAL=1` (fail if any external request is attempted)

<!-- QA_FLOW_EXPLORE_START -->
## Extensions: Screen Flow & Exploratory

### Screen Flow (BFS crawl → Mermaid/JSON)
- Generate into artifacts:
  - `npm run qa:flow`
- Publish to docs/qa as well:
  - `npm run qa:flow:publish`

Env:
- QA_FLOW_START_PATH (default "/")
- QA_FLOW_MAX_PAGES (default 200)
- QA_FLOW_MAX_DEPTH (default 10)
- QA_FLOW_PUBLISH (default 0)

Outputs:
- `.qa/artifacts/flow/screen-flow.md`
- `.qa/artifacts/flow/screen-flow.json`
- (optional) `docs/qa/screen-flow.md`, `docs/qa/screen-flow.json`

### Exploratory (random walk, timeboxed)
- `QA_EXPLORE_SECONDS=120 npm run qa:explore`
- Reproduce with seed:
  - `QA_EXPLORE_SEED=123 QA_EXPLORE_SECONDS=60 npm run qa:explore`

This test fails on:
- HTTP >= 400
- pageerror / console error

It attaches:
- explore-seed.txt
- explore-history.txt
- explore-errors.txt (if any)
<!-- QA_FLOW_EXPLORE_END -->

