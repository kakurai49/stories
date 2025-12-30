# Playwright smoke tests for GitHub Pages

This repository includes a Playwright-based smoke test that captures full-page screenshots of the published GitHub Pages site.

## Base URL detection order
The `playwright.config.ts` resolves `baseURL` automatically in the following order:
1. `BASE_URL` environment variable (respects any provided URL).
2. `gh api repos/{owner}/{repo}/pages --jq .html_url` when the `gh` CLI and repo info are available.
3. `CNAME` file in the repository root.
4. Git remote `origin` (or last commit author’s noreply email) → `https://{owner}.github.io/{repo}/` (or `{owner}.github.io` if the repo matches that pattern).
5. Fallback: `https://<repository-name>.github.io/`

Trailing slashes are enforced to keep routing consistent.

## Setup
```bash
# Install dependencies
pnpm install

# Install Playwright browsers & Linux dependencies (headless-friendly)
pnpm run e2e:install
```

## Run the smoke test
```bash
pnpm run e2e   # runs: playwright test --project=chromium
```

Outputs:
- Screenshots: `artifacts/screenshots/`
- Test results: `artifacts/test-results/`
- HTML report: `artifacts/playwright-report/`

To bundle the artifacts for download:
```bash
zip -r artifacts_bundle.zip artifacts
```

### Proxy / restricted network notes
- If `github.io` is blocked by your proxy, set `BASE_URL` to a reachable mirror before running (e.g., `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/`).
- The config also honors `HTTP_PROXY`/`HTTPS_PROXY` and ignores certificate errors to accommodate MITM proxies.
