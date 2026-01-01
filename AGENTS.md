<!-- QA_POCKET_START -->
# QA Pocket (Playwright / Offline)

## Rules
- Do NOT access external websites during tests.
- Use Playwright webServer to start local dev server.
- QA assets live under `.qa/`.

## Core commands
- Setup base pocket: `bash .qa/setup.sh`
- Setup flow/coverage addon: `bash .qa/setup-flow-coverage.sh`
- Run all (fixlist + guided explore + runlog): `bash .qa/run-flow-coverage.sh`

## Flow / Fix list
- Generate screen flow (artifacts): `npm run qa:flow`
- Generate screen flow (publish docs): `npm run qa:flow:publish`
- Analyze unreachable + fix list (publish docs): `npm run qa:flow:analyze:publish`
- One-shot fixlist (flow + analyze, publish docs): `npm run qa:fixlist`

## Explore
- Guided explore (prefer unvisited): `QA_EXPLORE_SECONDS=120 npm run qa:explore:guided`

## Config
- Screenshot/visual routes: `.qa/routes.txt`
- Unreachable target routes: `.qa/known-routes.txt`
- Flow params: QA_FLOW_START_PATH / QA_FLOW_MAX_PAGES / QA_FLOW_MAX_DEPTH / QA_FLOW_PUBLISH
- Explore params: QA_EXPLORE_SECONDS / QA_EXPLORE_SEED / QA_EXPLORE_START_PATH / QA_EXPLORE_PUBLISH

## Outputs
- Artifacts (gitignored): `.qa/artifacts/`
  - Flow: `.qa/artifacts/flow/screen-flow.md|json`
  - Analysis: `.qa/artifacts/flow/flow-analysis.md|json`, `.qa/artifacts/flow/link-fix-list.md`
  - Explore: `.qa/artifacts/explore/guided-coverage.json`
- Docs (committable): `docs/qa/`
  - screen-flow.*, flow-analysis.*, link-fix-list.md, guided-coverage.json, QA_POCKET_RUNLOG.md
<!-- QA_POCKET_END -->




