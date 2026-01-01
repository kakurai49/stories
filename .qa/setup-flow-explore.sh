#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

echo "== QA Flow/Explore addon setup =="

# Ensure base QA pocket exists
if [ ! -f ".qa/playwright.config.ts" ] || [ ! -f ".qa/qa.config.ts" ]; then
  if [ -f ".qa/setup.sh" ]; then
    echo "Base .qa not found. Running: bash .qa/setup.sh"
    bash .qa/setup.sh
  else
    echo "ERROR: Base QA pocket not found (.qa/setup.sh missing)."
    exit 1
  fi
fi

mkdir -p .qa/tests/flow .qa/tests/exploratory
mkdir -p .qa/artifacts/flow

cat > .qa/tests/flow/screen-flow.spec.ts <<'EOF'
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "../_support/test";
import { qa } from "../../qa.config";

type Edge = { from: string; to: string };
type Broken = { from: string; href: string; reason: string };

function isSkippableHref(href: string): boolean {
  const h = href.trim();
  return (
    h === "#" ||
    h.startsWith("#") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.startsWith("javascript:")
  );
}

function normalizeAbs(abs: string): string {
  const u = new URL(abs);
  u.hash = "";
  u.search = "";
  // normalize trailing slash (except root)
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

function pathLabel(abs: string): string {
  const u = new URL(abs);
  const p = u.pathname && u.pathname.length ? u.pathname : "/";
  return p.length > 1 && p.endsWith("/") ? p.replace(/\/+$/, "") : p;
}

function makeIdFactory() {
  const map = new Map<string, string>();
  let i = 0;
  return (label: string) => {
    if (!map.has(label)) map.set(label, `N${i++}`);
    return map.get(label)!;
  };
}

test.describe.configure({ mode: "serial" });

test("generate screen flow (BFS crawl)", async ({ page }, testInfo) => {
  const startPath = process.env.QA_FLOW_START_PATH ?? "/";
  const maxPages = Number(process.env.QA_FLOW_MAX_PAGES ?? "200");
  const maxDepth = Number(process.env.QA_FLOW_MAX_DEPTH ?? "10");
  const publish = (process.env.QA_FLOW_PUBLISH ?? "0") === "1";

  // Give enough time for crawling
  test.setTimeout(5 * 60 * 1000);

  const base = qa.baseURL;
  const baseOrigin = new URL(base).origin;
  const startAbs = normalizeAbs(new URL(startPath, base).toString());

  const visited = new Set<string>();
  const pages = new Set<string>();
  const edges: Edge[] = [];
  const broken: Broken[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console: ${msg.text()}`);
  });

  const queue: Array<{ abs: string; depth: number }> = [{ abs: startAbs, depth: 0 }];

  while (queue.length > 0 && visited.size < maxPages) {
    const item = queue.shift()!;
    const abs = item.abs;
    const depth = item.depth;

    if (visited.has(abs)) continue;
    visited.add(abs);

    const fromPath = pathLabel(abs);
    pages.add(fromPath);

    if (depth > maxDepth) continue;

    let resp: any = null;
    try {
      resp = await page.goto(abs, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(qa.waitAfterGotoMs);
    } catch (e: any) {
      broken.push({ from: fromPath, href: abs, reason: `goto failed: ${String(e)}` });
      continue;
    }

    const status = resp?.status?.();
    if (typeof status === "number" && status >= 400) {
      broken.push({ from: fromPath, href: abs, reason: `HTTP ${status}` });
    }

    const hrefs = await page.$$eval("a[href]", (as) =>
      as.map((a) => a.getAttribute("href") || "").filter(Boolean)
    );

    for (const rawHref of hrefs) {
      if (!rawHref) continue;
      const href = rawHref.trim();
      if (!href || isSkippableHref(href)) continue;

      let targetAbsRaw: string;
      try {
        targetAbsRaw = new URL(href, abs).toString();
      } catch {
        broken.push({ from: fromPath, href, reason: "invalid URL" });
        continue;
      }

      const targetAbs = normalizeAbs(targetAbsRaw);

      // internal only
      let targetOrigin = "";
      try {
        targetOrigin = new URL(targetAbs).origin;
      } catch {
        continue;
      }
      if (targetOrigin !== baseOrigin) continue;

      const toPath = pathLabel(targetAbs);
      pages.add(toPath);
      edges.push({ from: fromPath, to: toPath });

      if (!visited.has(targetAbs) && depth + 1 <= maxDepth) {
        queue.push({ abs: targetAbs, depth: depth + 1 });
      }
    }
  }

  // Deduplicate edges
  const uniqueEdges = new Map<string, Edge>();
  for (const e of edges) uniqueEdges.set(`${e.from}-->${e.to}`, e);

  // Prepare outputs
  const flowDir = path.join(qa.artifactsDir, "flow");
  const outMd = path.join(flowDir, "screen-flow.md");
  const outJson = path.join(flowDir, "screen-flow.json");

  await fs.mkdir(flowDir, { recursive: true });

  const blocked = ((testInfo as any)._blockedRequests ?? []) as string[];

  const idOf = makeIdFactory();
  const pageList = Array.from(pages).sort();
  const edgeList = Array.from(uniqueEdges.values()).sort((a, b) =>
    `${a.from}-->${a.to}`.localeCompare(`${b.from}-->${b.to}`)
  );

  let md = "";
  md += "# 画面遷移図（自動生成 / QA Flow）\n\n";
  md += `- baseURL: ${base}\n`;
  md += `- startPath: ${startPath}\n`;
  md += `- pages: ${pageList.length}\n`;
  md += `- edges: ${edgeList.length}\n`;
  md += `- maxPages: ${maxPages}\n`;
  md += `- maxDepth: ${maxDepth}\n\n`;

  md += "```mermaid\n";
  md += "graph TD\n";
  for (const p of pageList) {
    const id = idOf(p);
    const label = p.replaceAll('"', '\\"');
    md += `  ${id}["${label}"]\n`;
  }
  for (const e of edgeList) {
    md += `  ${idOf(e.from)} --> ${idOf(e.to)}\n`;
  }
  md += "```\n\n";

  if (broken.length > 0) {
    md += "## 壊れていそうな遷移（要確認）\n\n";
    for (const b of broken.slice(0, 200)) {
      md += `- from: \`${b.from}\` / href: \`${b.href}\` / reason: ${b.reason}\n`;
    }
    if (broken.length > 200) md += `\n…and ${broken.length - 200} more\n`;
    md += "\n";
  }

  if (consoleErrors.length > 0) {
    md += "## Console / Page Error（要確認）\n\n";
    for (const e of consoleErrors.slice(0, 200)) md += `- ${e}\n`;
    if (consoleErrors.length > 200) md += `\n…and ${consoleErrors.length - 200} more\n`;
    md += "\n";
  }

  if (blocked.length > 0) {
    md += "## ブロックされた外部リクエスト（オフライン前提のため遮断）\n\n";
    for (const u of blocked.slice(0, 200)) md += `- ${u}\n`;
    if (blocked.length > 200) md += `\n…and ${blocked.length - 200} more\n`;
    md += "\n";
  }

  const json = {
    meta: {
      baseURL: base,
      startPath,
      maxPages,
      maxDepth,
      generatedAt: new Date().toISOString(),
    },
    pages: pageList,
    edges: edgeList,
    broken,
    consoleErrors,
    blockedExternalRequests: blocked,
  };

  await fs.writeFile(outMd, md, "utf8");
  await fs.writeFile(outJson, JSON.stringify(json, null, 2), "utf8");

  // Attach to report
  await testInfo.attach("screen-flow.md", { path: outMd, contentType: "text/markdown" });
  await testInfo.attach("screen-flow.json", { path: outJson, contentType: "application/json" });

  // Optional publish to docs/qa
  if (publish) {
    const docsDir = path.resolve(process.cwd(), "docs", "qa");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, "screen-flow.md"), md, "utf8");
    await fs.writeFile(path.join(docsDir, "screen-flow.json"), JSON.stringify(json, null, 2), "utf8");
  }

  expect(true).toBeTruthy();
});
EOF

cat > .qa/tests/exploratory/random-walk.spec.ts <<'EOF'
import { test, expect } from "../_support/test";
import { qa } from "../../qa.config";

function makeRng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function isSkippableHref(href: string): boolean {
  const h = href.trim();
  return (
    h === "#" ||
    h.startsWith("#") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.startsWith("javascript:")
  );
}

test.describe.configure({ mode: "serial" });

test("exploratory: random walk (timeboxed)", async ({ page }, testInfo) => {
  const seconds = Number(process.env.QA_EXPLORE_SECONDS ?? "120");
  const seed = Number(process.env.QA_EXPLORE_SEED ?? String(Date.now()));
  const startPath =
    process.env.QA_EXPLORE_START_PATH ?? (qa.routes?.[0] ?? "/");

  // Ensure timeout > exploration window
  test.setTimeout((seconds + 60) * 1000);

  const rng = makeRng(seed);
  const base = qa.baseURL;
  const baseOrigin = new URL(base).origin;

  const history: string[] = [];
  const errors: string[] = [];

  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });

  const deadline = Date.now() + seconds * 1000;

  async function goto(url: string) {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(qa.waitAfterGotoMs);

    history.push(url);

    const status = resp?.status?.();
    if (typeof status === "number" && status >= 400) {
      throw new Error(`HTTP ${status} at ${url}`);
    }

    if (errors.length > 0) {
      throw new Error(`Console/Page error at ${url}: ${errors.join(" | ")}`);
    }
  }

  try {
    const startUrl = new URL(startPath, base).toString();
    await goto(startUrl);

    while (Date.now() < deadline) {
      const hrefs = await page.$$eval("a[href]", (as) =>
        as.map((a) => a.getAttribute("href") || "").filter(Boolean)
      );

      const candidates = hrefs
        .map((h) => h.trim())
        .filter((h) => h && !isSkippableHref(h))
        .slice(0, 200);

      if (candidates.length === 0) {
        // dead end: go back to start
        await goto(startUrl);
        continue;
      }

      const pick = candidates[Math.floor(rng() * candidates.length)];
      let nextUrl: string;
      try {
        nextUrl = new URL(pick, page.url()).toString();
      } catch {
        continue;
      }

      // internal only
      if (new URL(nextUrl).origin !== baseOrigin) continue;

      await goto(nextUrl);
    }

    expect(true).toBeTruthy();
  } finally {
    await testInfo.attach("explore-seed.txt", {
      body: String(seed),
      contentType: "text/plain",
    });
    await testInfo.attach("explore-history.txt", {
      body: history.join("\n"),
      contentType: "text/plain",
    });
    if (errors.length > 0) {
      await testInfo.attach("explore-errors.txt", {
        body: errors.join("\n"),
        contentType: "text/plain",
      });
    }
  }
});
EOF

# Update package.json scripts
node <<'NODE'
const fs = require("fs");
const path = require("path");
const pkgPath = path.resolve(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.scripts = pkg.scripts || {};

pkg.scripts["qa:flow"] = "playwright test -c .qa/playwright.config.ts .qa/tests/flow";
pkg.scripts["qa:flow:publish"] = "QA_FLOW_PUBLISH=1 playwright test -c .qa/playwright.config.ts .qa/tests/flow";
pkg.scripts["qa:explore"] = "playwright test -c .qa/playwright.config.ts .qa/tests/exploratory";

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
NODE

# Update AGENTS.md (replace QA_POCKET block)
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
- Install/update pocket: \`bash .qa/setup.sh\`
- Screenshots: \`npm run qa:shots\`
- Visual baselines: \`npm run qa:visual:update\`
- Visual compare: \`npm run qa:visual\`
- Screen flow graph: \`npm run qa:flow\` (artifacts) / \`npm run qa:flow:publish\` (also writes docs/qa/)
- Exploratory random walk: \`QA_EXPLORE_SECONDS=120 npm run qa:explore\` (seedable)

## Config
- Routes list: \`.qa/routes.txt\`
- Main config: \`.qa/qa.config.ts\`
- Flow params: QA_FLOW_START_PATH / QA_FLOW_MAX_PAGES / QA_FLOW_MAX_DEPTH / QA_FLOW_PUBLISH
- Explore params: QA_EXPLORE_SECONDS / QA_EXPLORE_SEED / QA_EXPLORE_START_PATH

## Outputs
- Artifacts (gitignored): \`.qa/artifacts/\`
  - Screenshots: \`.qa/artifacts/shots/\`
  - Flow: \`.qa/artifacts/flow/screen-flow.md|json\`
  - Test results/diffs: \`.qa/artifacts/test-results/\`
- Published docs (optional): \`docs/qa/screen-flow.md|json\`
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

# Append extension section to .qa/README.md (marker-based)
node <<'NODE'
const fs = require("fs");
const path = require("path");

const file = path.resolve(process.cwd(), ".qa/README.md");
const START = "<!-- QA_FLOW_EXPLORE_START -->";
const END = "<!-- QA_FLOW_EXPLORE_END -->";

const block =
`${START}
## Extensions: Screen Flow & Exploratory

### Screen Flow (BFS crawl → Mermaid/JSON)
- Generate into artifacts:
  - \`npm run qa:flow\`
- Publish to docs/qa as well:
  - \`npm run qa:flow:publish\`

Env:
- QA_FLOW_START_PATH (default "/")
- QA_FLOW_MAX_PAGES (default 200)
- QA_FLOW_MAX_DEPTH (default 10)
- QA_FLOW_PUBLISH (default 0)

Outputs:
- \`.qa/artifacts/flow/screen-flow.md\`
- \`.qa/artifacts/flow/screen-flow.json\`
- (optional) \`docs/qa/screen-flow.md\`, \`docs/qa/screen-flow.json\`

### Exploratory (random walk, timeboxed)
- \`QA_EXPLORE_SECONDS=120 npm run qa:explore\`
- Reproduce with seed:
  - \`QA_EXPLORE_SEED=123 QA_EXPLORE_SECONDS=60 npm run qa:explore\`

This test fails on:
- HTTP >= 400
- pageerror / console error

It attaches:
- explore-seed.txt
- explore-history.txt
- explore-errors.txt (if any)
${END}
`;

let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (text.includes(START) && text.includes(END)) {
  const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`, "m");
  text = text.replace(re, block + "\n");
} else {
  if (text && !text.endsWith("\n")) text += "\n";
  text += "\n" + block + "\n";
}
fs.writeFileSync(file, text);
NODE

chmod +x .qa/setup-flow-explore.sh

echo "✅ Added Flow/Explore extensions."
echo "Next:"
echo "  npm run qa:flow"
echo "  QA_EXPLORE_SECONDS=30 npm run qa:explore"
