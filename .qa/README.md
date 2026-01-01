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
