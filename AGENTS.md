<!-- QA_POCKET_START -->
# QA Pocket (Playwright / Offline)

## Rules
- Do NOT access external websites during tests.
- Use Playwright webServer to start local dev server.
- QA assets live under `.qa/`.

## Commands
- Install/update pocket: `bash .qa/setup.sh`
- Screenshots: `npm run qa:shots`
- Visual baselines: `npm run qa:visual:update`
- Visual compare: `npm run qa:visual`
- Screen flow graph: `npm run qa:flow` (artifacts) / `npm run qa:flow:publish` (also writes docs/qa/)
- Exploratory random walk: `QA_EXPLORE_SECONDS=120 npm run qa:explore` (seedable)

## Config
- Routes list: `.qa/routes.txt`
- Main config: `.qa/qa.config.ts`
- Flow params: QA_FLOW_START_PATH / QA_FLOW_MAX_PAGES / QA_FLOW_MAX_DEPTH / QA_FLOW_PUBLISH
- Explore params: QA_EXPLORE_SECONDS / QA_EXPLORE_SEED / QA_EXPLORE_START_PATH

## Outputs
- Artifacts (gitignored): `.qa/artifacts/`
  - Screenshots: `.qa/artifacts/shots/`
  - Flow: `.qa/artifacts/flow/screen-flow.md|json`
  - Test results/diffs: `.qa/artifacts/test-results/`
- Published docs (optional): `docs/qa/screen-flow.md|json`
<!-- QA_POCKET_END -->



