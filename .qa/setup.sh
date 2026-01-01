#!/usr/bin/env bash
set -euo pipefail

# =========================================
# QA Pocket Bootstrap (for Codespaces/Codex)
# - Installs Playwright + Chromium
# - Creates .qa/ pocket (TS config/tests)
# - Adds package.json scripts
# - Blocks external network requests in browser
# - Provides screenshot capture + visual regression
# =========================================

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

echo "== QA Pocket setup =="
echo "Repo root: $ROOT"

if [ ! -f package.json ]; then
  echo "ERROR: package.json not found at repo root."
  exit 1
fi

# ---- Detect package manager (npm/pnpm/yarn) ----
PM="npm"
PM_ADD="npm i -D"
PM_RUN="npm run"
PM_EXEC="npx"

if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
  PM_ADD="pnpm add -D"
  PM_RUN="pnpm"
  PM_EXEC="pnpm exec"
elif [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
  PM="yarn"
  PM_ADD="yarn add -D"
  PM_RUN="yarn"
  PM_EXEC="yarn"
fi

echo "Package manager: $PM"

# ---- Install deps (idempotent) ----
echo "== Installing devDependencies =="
$PM_ADD @playwright/test typescript

# ---- Install browser (Chromium) ----
echo "== Installing Playwright browser (Chromium) =="
set +e
$PM_EXEC playwright install --with-deps chromium
STATUS=$?
set -e
if [ $STATUS -ne 0 ]; then
  echo "WARN: 'playwright install --with-deps chromium' failed. Retrying without --with-deps..."
  $PM_EXEC playwright install chromium
fi

# ---- Create pocket directories ----
echo "== Creating .qa/ pocket structure =="
mkdir -p .qa/tests/_support .qa/tests/screenshots .qa/tests/visual .qa/artifacts

# ---- Write .qa/qa.config.ts (portable runtime detection) ----
cat > .qa/qa.config.ts <<'EOF'
import fs from "node:fs";
import path from "node:path";

export type QaProfile = "next" | "vite" | "generic";
export type QaPm = "npm" | "pnpm" | "yarn";

function readJson(p: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function detectProfile(): QaProfile {
  const forced = (process.env.QA_PROFILE ?? "").trim();
  if (forced === "next" || forced === "vite" || forced === "generic") return forced;

  const pkg = readJson(path.resolve(process.cwd(), "package.json")) ?? {};
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  if (deps.next) return "next";
  if (deps.vite || deps["@vitejs/plugin-react"] || deps["@vitejs/plugin-vue"] || deps["@vitejs/plugin-svelte"]) {
    return "vite";
  }
  return "generic";
}

function detectPm(): QaPm {
  const forced = (process.env.QA_PM ?? "").trim();
  if (forced === "npm" || forced === "pnpm" || forced === "yarn") return forced;

  // lockfile-based detection
  if (fs.existsSync(path.resolve(process.cwd(), "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.resolve(process.cwd(), "yarn.lock"))) return "yarn";
  return "npm";
}

const pocketDir = path.resolve(process.cwd(), ".qa");
const routesFile = path.resolve(pocketDir, "routes.txt");

function parseRoutes(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.startsWith("/") ? l : `/${l}`));
}

function loadRoutes(): string[] {
  if (process.env.QA_ROUTES) {
    return process.env.QA_ROUTES
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith("/") ? l : `/${l}`));
  }
  if (fs.existsSync(routesFile)) {
    return parseRoutes(fs.readFileSync(routesFile, "utf8"));
  }
  return ["/"];
}

const profile = detectProfile();
const pm = detectPm();

const host = process.env.QA_HOST ?? "127.0.0.1";
const port = Number(process.env.QA_PORT ?? (profile === "vite" ? "5173" : "3000"));
const baseURL = process.env.QA_BASE_URL ?? `http://${host}:${port}`;

// Allow override (most reliable)
function defaultWebCmd(): string {
  if (process.env.QA_WEB_CMD) return process.env.QA_WEB_CMD;

  // Use the repo's package manager to run dev server
  const runner = pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : "npm run";

  // Prefer listening on 0.0.0.0 (Codespaces port-forward friendly),
  // but Playwright will access via 127.0.0.1 (baseURL) inside the container.
  if (profile === "next") {
    // Next: -p port, -H host
    return runner === "npm run"
      ? `npm run dev -- -p ${port} -H 0.0.0.0`
      : `${runner} dev -- -p ${port} -H 0.0.0.0`;
  }

  if (profile === "vite") {
    return runner === "npm run"
      ? `npm run dev -- --host 0.0.0.0 --port ${port}`
      : `${runner} dev -- --host 0.0.0.0 --port ${port}`;
  }

  // generic: just run dev
  return runner === "npm run" ? `npm run dev` : `${runner} dev`;
}

export const qa = {
  pocketDir,
  artifactsDir: path.resolve(pocketDir, "artifacts"),

  profile,
  pm,

  baseURL,
  webCommand: defaultWebCmd(),

  routes: loadRoutes(),

  waitAfterGotoMs: Number(process.env.QA_WAIT_MS ?? "300"),

  // External requests are blocked by default (offline-friendly)
  blockExternal: process.env.QA_BLOCK_EXTERNAL === "0" ? false : true,

  // If strict, fail when external requests were blocked
  strictExternal: process.env.QA_STRICT_EXTERNAL === "1" ? true : false,
};

export function safeRouteName(route: string): string {
  const cleaned = (route || "/")
    .replace(/[?#].*$/, "")
    .replace(/\/+$, "");
  if (cleaned === "" || cleaned === "/") return "home";

  return cleaned
    .replaceAll("/", "_")
    .replace(/^_+/, "")
    .replace(/[^a-zA-Z0-9_\-]/g, "_");
}
EOF

# ---- Write .qa/playwright.config.ts ----
cat > .qa/playwright.config.ts <<'EOF'
import { defineConfig } from "@playwright/test";
import path from "node:path";
import { qa } from "./qa.config";

export default defineConfig({
  testDir: path.join(qa.pocketDir, "tests"),
  outputDir: path.join(qa.artifactsDir, "test-results"),
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(qa.artifactsDir, "playwright-report") }],
  ],

  use: {
    baseURL: qa.baseURL,
    browserName: "chromium",
    headless: true,

    viewport: { width: 1280, height: 720 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",

    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },

  // Always start local dev server (no file:// mode)
  webServer: {
    command: qa.webCommand,
    url: qa.baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
EOF

# ---- Common fixture: block external + stabilize visuals ----
cat > .qa/tests/_support/test.ts <<'EOF'
import { test as base, expect } from "@playwright/test";
import { qa } from "../../qa.config";

export const test = base;

test.beforeEach(async ({ context, page }, testInfo) => {
  const blocked: string[] = [];
  (testInfo as any)._blockedRequests = blocked;

  if (qa.blockExternal) {
    const allowedOrigin = new URL(qa.baseURL).origin;

    await context.route("**/*", (route) => {
      const url = route.request().url();

      // Allow local-only schemes
      if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file:")) {
        return route.continue();
      }

      try {
        const origin = new URL(url).origin;
        if (origin === allowedOrigin) return route.continue();

        blocked.push(url);
        return route.abort();
      } catch {
        return route.continue();
      }
    });
  }

  // Visual stability: kill animations/transitions
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        scroll-behavior: auto !important;
      }
    `;
    document.documentElement.appendChild(style);
  });
});

test.afterEach(async ({}, testInfo) => {
  const blocked = ((testInfo as any)._blockedRequests ?? []) as string[];
  if (blocked.length > 0) {
    await testInfo.attach("blocked-requests.txt", {
      body: blocked.join("\n"),
      contentType: "text/plain",
    });

    if (qa.strictExternal) {
      // Fail if any external request was attempted (blocked)
      expect(blocked, "External requests were attempted (blocked). Set QA_STRICT_EXTERNAL=0 to allow.").toEqual([]);
    }
  }
});

export { expect };
EOF

# ---- Screenshot capture test ----
cat > .qa/tests/screenshots/capture.spec.ts <<'EOF'
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "../_support/test";
import { qa, safeRouteName } from "../../qa.config";

test.describe.configure({ mode: "serial" });

test("capture screenshots for routes", async ({ page }) => {
  const outDir = path.join(qa.artifactsDir, "shots");
  await fs.mkdir(outDir, { recursive: true });

  for (const route of qa.routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(qa.waitAfterGotoMs);

    await page.screenshot({
      path: path.join(outDir, `${safeRouteName(route)}.png`),
      fullPage: true,
    });
  }

  expect(true).toBeTruthy();
});
EOF

# ---- Visual regression test (baseline snapshots) ----
cat > .qa/tests/visual/routes.visual.spec.ts <<'EOF'
import { test, expect } from "../_support/test";
import { qa, safeRouteName } from "../../qa.config";

test.describe.configure({ mode: "serial" });

for (const route of qa.routes) {
  test(`visual: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(qa.waitAfterGotoMs);

    await expect(page).toHaveScreenshot(`${safeRouteName(route)}.png`, {
      fullPage: true,
    });
  });
}
EOF

# ---- routes.txt (do not overwrite if user already has it) ----
if [ ! -f .qa/routes.txt ]; then
  cat > .qa/routes.txt <<'EOF'
# 1行1ルート（# はコメント）
/
# /about
# /contact
EOF
fi

# ---- .qa/README.md ----
cat > .qa/README.md <<'EOF'
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
EOF

# ---- Update .gitignore ----
touch .gitignore
if ! grep -qxF ".qa/artifacts/" .gitignore; then
  echo "" >> .gitignore
  echo ".qa/artifacts/" >> .gitignore
fi

# ---- Update package.json scripts (no manual edit) ----
echo "== Updating package.json scripts =="
node <<'NODE'
const fs = require("fs");
const path = require("path");

const pkgPath = path.resolve(process.cwd(), "package.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.scripts = pkg.scripts || {};

const add = {
  "qa:test": "playwright test -c .qa/playwright.config.ts",
  "qa:shots": "playwright test -c .qa/playwright.config.ts .qa/tests/screenshots",
  "qa:visual": "playwright test -c .qa/playwright.config.ts .qa/tests/visual",
  "qa:visual:update": "playwright test -c .qa/playwright.config.ts .qa/tests/visual --update-snapshots",
  "qa:report": "playwright show-report .qa/artifacts/playwright-report"
};

for (const [k, v] of Object.entries(add)) {
  pkg.scripts[k] = v;
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
NODE

# ---- Create/Update root AGENTS.md (idempotent markers) ----
echo "== Updating AGENTS.md =="
node <<'NODE'
const fs = require("fs");
const path = require("path");

const file = path.resolve(process.cwd(), "AGENTS.md");
const START = "<!-- QA_POCKET_START -->";
const END = "<!-- QA_POCKET_END -->";

const block =
`${START}
# QA Pocket (Playwright / Offline)

## Rules
- Do NOT access external websites during tests.
- Use Playwright webServer to start local dev server.
- QA assets live under \`.qa/\`.

## Commands
- Screenshots: \`npm run qa:shots\`
- Visual baselines: \`npm run qa:visual:update\`
- Visual compare: \`npm run qa:visual\`

## Config
- Routes: \`.qa/routes.txt\`
- Main config: \`.qa/qa.config.ts\`

## Outputs
- Artifacts (gitignored): \`.qa/artifacts/\`
- Visual baselines (commit): \`.qa/tests/visual/**-snapshots/\`
${END}
`;

let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";

if (text.includes(START) && text.includes(END)) {
  const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`, "m");
  text = text.replace(re, block + "\n");
} else {
  if (text && !text.endsWith("\n")) text += "\n";
  if (text.trim().length > 0) text += "\n";
  text += block + "\n";
}

fs.writeFileSync(file, text);
NODE

echo "✅ QA Pocket installed."
echo ""
echo "Next (run inside Codespaces):"
echo "  $PM_RUN qa:shots"
echo "  $PM_RUN qa:visual:update   # first time (create baselines)"
echo "  $PM_RUN qa:visual          # compare"
echo ""
echo "Routes: edit .qa/routes.txt"
