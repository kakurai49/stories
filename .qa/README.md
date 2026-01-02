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
- Strategy can be switched with `QA_EXPLORE_STRATEGY=random-walk|guided-coverage` (default depends on the spec you run). Strategies live under `.qa/tests/exploratory/strategies/` and are driven by the common runner in `.qa/tests/exploratory/runner.ts`.

This test fails on:
- HTTP >= 400
- pageerror / console error

It attaches:
- explore-seed.txt
- explore-history.txt
- explore-errors.txt (if any)
<!-- QA_FLOW_EXPLORE_END -->


<!-- QA_FLOW_COVERAGE_START -->
## Extensions: Flow / Fix List / Guided Explore

### Flow (screen-flow.json/md)
- Generate flow artifacts:
  - `npm run qa:flow`
- Publish to docs/qa as well:
  - `npm run qa:flow:publish`

### Flow Analyze (unreachable + fix list)
- Analyze flow and generate fix list:
  - `npm run qa:flow:analyze`
- Publish docs:
  - `npm run qa:flow:analyze:publish`
- One-shot fixlist (flow + analyze, publish docs):
  - `npm run qa:fixlist`

Unreachable is computed as:
- `.qa/known-routes.txt` (expected routes)
  minus
- `screen-flow.json` pages (reachable via links)

### Guided Explore (prefer unvisited)
- `QA_EXPLORE_SECONDS=120 npm run qa:explore:guided`
- Publish JSON to docs:
  - set `QA_EXPLORE_PUBLISH=1`

### One command run (recommended)
- `bash .qa/run-flow-coverage.sh`

Outputs (committable):
- `docs/qa/screen-flow.md|json`
- `docs/qa/flow-analysis.md|json`
- `docs/qa/link-fix-list.md`
- `docs/qa/guided-coverage.json`
- `docs/qa/QA_POCKET_RUNLOG.md`
<!-- QA_FLOW_COVERAGE_END -->
