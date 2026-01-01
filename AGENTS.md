<!-- QA_POCKET_START -->
# QA Pocket (Playwright / Offline)

## Rules
- Do NOT access external websites during tests.
- Use Playwright webServer to start local dev server.
- QA assets live under `.qa/`.

## Commands
- Screenshots: `npm run qa:shots`
- Visual baselines: `npm run qa:visual:update`
- Visual compare: `npm run qa:visual`

## Config
- Routes: `.qa/routes.txt`
- Main config: `.qa/qa.config.ts`

## Outputs
- Artifacts (gitignored): `.qa/artifacts/`
- Visual baselines (commit): `.qa/tests/visual/**-snapshots/`
<!-- QA_POCKET_END -->


