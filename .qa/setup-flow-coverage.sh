#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

echo "== QA Flow Coverage addon setup =="

if [ ! -f ".qa/setup.sh" ]; then
  echo "ERROR: .qa/setup.sh not found. Install base QA pocket first."
  exit 1
fi

# Ensure base pocket exists
if [ ! -f ".qa/playwright.config.ts" ] || [ ! -f ".qa/qa.config.ts" ]; then
  echo "Base QA pocket not fully installed. Running: bash .qa/setup.sh"
  bash .qa/setup.sh
fi

mkdir -p .qa/tests/flow .qa/tests/exploratory
mkdir -p .qa/artifacts/flow .qa/artifacts/explore
mkdir -p docs/qa

backup() {
  local f="$1"
  if [ -f "$f" ]; then
    cp "$f" "$f.bak.$(date +%Y%m%d%H%M%S)"
  fi
}

write() {
  local f="$1"
  backup "$f"
  cat > "$f"
}

# -------------------------
# known routes file (for unreachable detection)
# -------------------------
if [ ! -f ".qa/known-routes.txt" ]; then
  cat > .qa/known-routes.txt <<'TXT'
# QA Known Routes (unreachable detection targets)
# - ここに「存在すると期待するページ（ルート）」を 1行1つで追加してください
# - unreachable は「known-routes にあるのに screen-flow で辿れなかったページ」です
#
# 例:
# /
# /about
# /contact
TXT
fi

# -------------------------
# Flow generator (BFS crawl)
# -------------------------
write .qa/tests/flow/screen-flow.spec.ts <<'TS'
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "../_support/test";
import { qa } from "../../qa.config";

type Edge = { from: string; to: string };
type Broken = { from: string; href: string; reason: string };

function isSkippableHref(href: string): boolean {
  const h = href.trim();
  return (
    !h ||
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
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

function pathLabel(abs: string): string {
  const u = new URL(abs);
  let p = u.pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p;
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

test("qa:flow (BFS crawl -> screen-flow.json/md)", async ({ page }, testInfo) => {
  const base = qa.baseURL;
  const baseOrigin = new URL(base).origin;

  const startPath = process.env.QA_FLOW_START_PATH ?? "/";
  const maxPages = Number(process.env.QA_FLOW_MAX_PAGES ?? "200");
  const maxDepth = Number(process.env.QA_FLOW_MAX_DEPTH ?? "10");
  const publish = (process.env.QA_FLOW_PUBLISH ?? "0") === "1";

  test.setTimeout(5 * 60 * 1000);

  const startAbs = normalizeAbs(new URL(startPath, base).toString());

  const visited = new Set<string>(); // abs URLs
  const pages = new Set<string>();   // path labels
  const edges: Edge[] = [];
  const broken: Broken[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console: ${msg.text()}`);
  });

  const queue: Array<{ abs: string; depth: number }> = [{ abs: startAbs, depth: 0 }];

  while (queue.length > 0 && visited.size < maxPages) {
    const { abs, depth } = queue.shift()!;
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
      const href = String(rawHref || "").trim();
      if (!href || isSkippableHref(href)) continue;

      let targetAbsRaw: string;
      try {
        targetAbsRaw = new URL(href, abs).toString();
      } catch {
        broken.push({ from: fromPath, href, reason: "invalid URL" });
        continue;
      }

      const targetAbs = normalizeAbs(targetAbsRaw);

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

  const blocked = ((testInfo as any)._blockedRequests ?? []) as string[];

  const flowDir = path.join(qa.artifactsDir, "flow");
  const outMd = path.join(flowDir, "screen-flow.md");
  const outJson = path.join(flowDir, "screen-flow.json");
  await fs.mkdir(flowDir, { recursive: true });

  const idOf = makeIdFactory();
  const pageList = Array.from(pages).sort();
  const edgeList = Array.from(uniqueEdges.values()).sort((a, b) =>
    `${a.from}-->${b.to}`.localeCompare(`${b.from}-->${b.to}`)
  );

  let md = "";
  md += "# 画面遷移図（自動生成 / qa:flow）\n\n";
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
    md += `  ${id}[\"${label}\"]\n`;
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

  await testInfo.attach("screen-flow.md", { path: outMd, contentType: "text/markdown" });
  await testInfo.attach("screen-flow.json", { path: outJson, contentType: "application/json" });

  if (publish) {
    const docsDir = path.resolve(process.cwd(), "docs", "qa");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, "screen-flow.md"), md, "utf8");
    await fs.writeFile(path.join(docsDir, "screen-flow.json"), JSON.stringify(json, null, 2), "utf8");
  }

  expect(true).toBeTruthy();
});
TS

# -------------------------
# Flow analyzer: unreachable + fix list
# -------------------------
write .qa/tests/flow/flow-analyze.spec.ts <<'TS'
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { qa } from "../../qa.config";

type Edge = { from: string; to: string };
type Broken = { from: string; href: string; reason: string };

function normalizePath(input: string): string {
  const s = (input || "").trim();
  if (!s) return "/";
  // If URL
  if (s.startsWith("http://") || s.startsWith("https://")) {
    const u = new URL(s);
    return normalizePath(u.pathname);
  }
  // Remove query/hash
  const p = s.replace(/[?#].*$/, "");
  let out = p.startsWith("/") ? p : `/${p}`;
  if (out.length > 1 && out.endsWith("/")) out = out.replace(/\/+$/, "");
  return out || "/";
}

function readLinesToRoutes(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map(normalizePath);
}

async function loadKnownRoutes(): Promise<{ routes: string[]; source: string }> {
  // 1) env override
  if (process.env.QA_KNOWN_ROUTES) {
    const routes = process.env.QA_KNOWN_ROUTES
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizePath);
    return { routes, source: "env:QA_KNOWN_ROUTES" };
  }

  // 2) file
  const file = process.env.QA_KNOWN_ROUTES_FILE ?? path.resolve(process.cwd(), ".qa", "known-routes.txt");
  try {
    const txt = await fs.readFile(file, "utf8");
    return { routes: readLinesToRoutes(txt), source: `file:${file}` };
  } catch {
    // 3) fallback to qa.routes (routes.txt)
    return { routes: (qa.routes ?? []).map(normalizePath), source: "qa.routes(.qa/routes.txt)" };
  }
}

function buildDegreeMaps(edges: Edge[]) {
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const e of edges) {
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
    // Ensure keys exist
    if (!inDeg.has(e.from)) inDeg.set(e.from, inDeg.get(e.from) ?? 0);
    if (!outDeg.has(e.to)) outDeg.set(e.to, outDeg.get(e.to) ?? 0);
  }
  return { inDeg, outDeg };
}

function topByOutDegree(outDeg: Map<string, number>, n: number): Array<{ page: string; out: number }> {
  return Array.from(outDeg.entries())
    .map(([page, out]) => ({ page, out }))
    .sort((a, b) => b.out - a.out || a.page.localeCompare(b.page))
    .slice(0, n);
}

function parentPaths(route: string): string[] {
  const p = normalizePath(route);
  if (p === "/") return [];
  const segs = p.split("/").filter(Boolean);
  const parents: string[] = [];
  for (let i = segs.length - 1; i >= 1; i--) {
    parents.push("/" + segs.slice(0, i).join("/"));
  }
  parents.push("/");
  return parents;
}

function firstSegment(route: string): string | null {
  const segs = normalizePath(route).split("/").filter(Boolean);
  return segs.length ? segs[0] : null;
}

function suggestSources(
  target: string,
  flowPages: Set<string>,
  outDeg: Map<string, number>,
  startPath: string
): string[] {
  const suggestions: string[] = [];
  const push = (p: string) => {
    const n = normalizePath(p);
    if (!flowPages.has(n)) return;
    if (!suggestions.includes(n)) suggestions.push(n);
  };

  // Prefer start and home
  push(startPath);
  push("/");

  // Prefer parent pages
  for (const parent of parentPaths(target)) push(parent);

  // Prefer same-section hubs
  const seg = firstSegment(target);
  if (seg) {
    const section = Array.from(flowPages).filter((p) => p === `/${seg}` || p.startsWith(`/${seg}/`));
    const sectionSorted = section
      .map((p) => ({ page: p, out: outDeg.get(p) ?? 0 }))
      .sort((a, b) => b.out - a.out || a.page.localeCompare(b.page))
      .slice(0, 3);
    for (const s of sectionSorted) push(s.page);
  }

  // Global hubs
  const hubs = topByOutDegree(outDeg, 5);
  for (const h of hubs) push(h.page);

  return suggestions.slice(0, 6);
}

test("qa:flow:analyze (unreachable + fix list)", async ({ request }, testInfo) => {
  test.setTimeout(5 * 60 * 1000);

  const publish = (process.env.QA_FLOW_PUBLISH ?? "0") === "1";

  const flowJsonPath =
    process.env.QA_FLOW_JSON ??
    path.join(qa.artifactsDir, "flow", "screen-flow.json");

  let flowRaw = "";
  try {
    flowRaw = await fs.readFile(flowJsonPath, "utf8");
  } catch {
    throw new Error(`screen-flow.json not found at ${flowJsonPath}. Run: npm run qa:flow (or qa:fixlist) first.`);
  }

  const flow = JSON.parse(flowRaw) as {
    meta: { baseURL: string; startPath: string; generatedAt: string };
    pages: string[];
    edges: Edge[];
    broken: Broken[];
    consoleErrors: string[];
    blockedExternalRequests: string[];
  };

  const baseURL = qa.baseURL;
  const startPath = normalizePath(flow?.meta?.startPath ?? "/");

  const flowPages = new Set<string>((flow.pages ?? []).map(normalizePath));
  const edges = (flow.edges ?? []).map((e) => ({ from: normalizePath(e.from), to: normalizePath(e.to) }));

  const { inDeg, outDeg } = buildDegreeMaps(edges);

  // Load known routes
  const known = await loadKnownRoutes();
  const knownSet = new Set<string>([...known.routes.map(normalizePath), ...(qa.routes ?? []).map(normalizePath)]);
  const knownRoutes = Array.from(knownSet).sort();

  // unreachable: in known routes but not in flow pages
  const unreachable = knownRoutes.filter((r) => !flowPages.has(r));

  // Check HTTP status for unreachable
  const unreachableChecked: Array<{
    route: string;
    status: number | null;
    note: string;
    suggestedFrom: string[];
  }> = [];

  for (const r of unreachable.slice(0, 300)) {
    const url = new URL(r, baseURL).toString();
    let status: number | null = null;
    let note = "";
    try {
      const resp = await request.get(url);
      status = resp.status();
      if (status >= 400) note = "ページが存在しない/ルーティング未設定の可能性";
      else note = "ページは存在するが、startからリンクで到達できない（リンク不足の可能性）";
    } catch (e: any) {
      note = `request failed: ${String(e)}`;
    }

    unreachableChecked.push({
      route: r,
      status,
      note,
      suggestedFrom: suggestSources(r, flowPages, outDeg, startPath),
    });
  }

  const deadEnds = Array.from(flowPages)
    .map((p) => ({ page: p, out: outDeg.get(p) ?? 0 }))
    .filter((x) => x.out === 0)
    .sort((a, b) => a.page.localeCompare(b.page));

  const orphans = Array.from(flowPages)
    .map((p) => ({ page: p, in: inDeg.get(p) ?? 0 }))
    .filter((x) => x.page !== startPath && x.in === 0)
    .sort((a, b) => a.page.localeCompare(b.page));

  const hubs = topByOutDegree(outDeg, 10);

  const analysisDir = path.join(qa.artifactsDir, "flow");
  await fs.mkdir(analysisDir, { recursive: true });

  const analysisJsonPath = path.join(analysisDir, "flow-analysis.json");
  const analysisMdPath = path.join(analysisDir, "flow-analysis.md");
  const fixMdPath = path.join(analysisDir, "link-fix-list.md");

  const counts = {
    knownRoutes: knownRoutes.length,
    crawledPages: flowPages.size,
    edges: edges.length,
    unreachable: unreachableChecked.length,
    deadEnds: deadEnds.length,
    orphans: orphans.length,
    broken: (flow.broken ?? []).length,
    consoleErrors: (flow.consoleErrors ?? []).length,
    blockedExternalRequests: (flow.blockedExternalRequests ?? []).length,
  };

  const analysisJson = {
    meta: {
      baseURL,
      startPath,
      flowJsonPath,
      knownRoutesSource: known.source,
      generatedAt: new Date().toISOString(),
    },
    counts,
    hubs,
    orphans,
    deadEnds,
    broken: flow.broken ?? [],
    consoleErrors: flow.consoleErrors ?? [],
    blockedExternalRequests: flow.blockedExternalRequests ?? [],
    unreachable: unreachableChecked,
  };

  // flow-analysis.md (detail)
  let md = "";
  md += "# QA Flow Analysis（自動生成）\n\n";
  md += `- baseURL: ${baseURL}\n`;
  md += `- startPath: ${startPath}\n`;
  md += `- knownRoutes: ${counts.knownRoutes}（source: ${known.source}）\n`;
  md += `- crawledPages: ${counts.crawledPages}\n`;
  md += `- edges: ${counts.edges}\n`;
  md += `- unreachable: ${counts.unreachable}\n`;
  md += `- deadEnds: ${counts.deadEnds}\n`;
  md += `- broken: ${counts.broken}\n\n`;

  md += "## Top Hubs（リンクが多いページ）\n\n";
  for (const h of hubs) md += `- ${h.page} (out=${h.out})\n`;
  md += "\n";

  if (orphans.length > 0) {
    md += "## Orphans（流入が0のページ）\n\n";
    for (const o of orphans.slice(0, 200)) md += `- ${o.page}\n`;
    if (orphans.length > 200) md += `\n…and ${orphans.length - 200} more\n`;
    md += "\n";
  }

  if (deadEnds.length > 0) {
    md += "## Dead Ends（遷移先リンクが見つからないページ）\n\n";
    for (const d of deadEnds.slice(0, 200)) md += `- ${d.page}\n`;
    if (deadEnds.length > 200) md += `\n…and ${deadEnds.length - 200} more\n`;
    md += "\n";
  }

  if ((flow.broken ?? []).length > 0) {
    md += "## Broken（移動失敗・HTTP>=400 等）\n\n";
    for (const b of (flow.broken ?? []).slice(0, 200)) {
      md += `- from: \`${b.from}\` / href: \`${b.href}\` / reason: ${b.reason}\n`;
    }
    if ((flow.broken ?? []).length > 200) md += `\n…and ${(flow.broken ?? []).length - 200} more\n`;
    md += "\n";
  }

  if (unreachableChecked.length > 0) {
    md += "## Unreachable（known-routes にあるがリンク到達できない）\n\n";
    md += "| route | http | suggestedFrom | note |\n";
    md += "|---|---:|---|---|\n";
    for (const u of unreachableChecked.slice(0, 200)) {
      const http = u.status === null ? "ERR" : String(u.status);
      md += `| \`${u.route}\` | ${http} | ${u.suggestedFrom.map((s) => `\`${s}\``).join(", ")} | ${u.note} |\n`;
    }
    if (unreachableChecked.length > 200) md += `\n\n…and ${unreachableChecked.length - 200} more\n`;
    md += "\n";
  }

  if ((flow.blockedExternalRequests ?? []).length > 0) {
    md += "## Blocked External Requests（外部アクセス遮断ログ）\n\n";
    for (const u of (flow.blockedExternalRequests ?? []).slice(0, 200)) md += `- ${u}\n`;
    if ((flow.blockedExternalRequests ?? []).length > 200) md += `\n…and ${(flow.blockedExternalRequests ?? []).length - 200} more\n`;
    md += "\n";
  }

  // link-fix-list.md (action list)
  let fix = "";
  fix += "# リンク不足 修正リスト（自動生成）\n\n";
  fix += `- baseURL: ${baseURL}\n`;
  fix += `- startPath: ${startPath}\n`;
  fix += `- knownRoutes: ${counts.knownRoutes}（source: ${known.source}）\n`;
  fix += `- unreachable: ${counts.unreachable}\n`;
  fix += `- deadEnds: ${counts.deadEnds}\n`;
  fix += `- broken: ${counts.broken}\n\n`;

  fix += "## A) Unreachable（リンク不足の可能性）\n\n";
  if (unreachableChecked.length === 0) {
    fix += "- なし\n\n";
  } else {
    for (const u of unreachableChecked) {
      const http = u.status === null ? "ERR" : String(u.status);
      if (u.status !== null && u.status >= 400) {
        fix += `- [ ] \`${u.route}\` が到達不能かつ HTTP ${http} → **ページ実装 or ルーティング見直し or known-routesから除外**（${u.note}）\n`;
      } else {
        fix += `- [ ] \`${u.route}\` が到達不能（HTTP ${http}） → **リンク追加**：候補 ${u.suggestedFrom.map((s) => `\`${s}\``).join(", ")}\n`;
      }
    }
    fix += "\n";
  }

  fix += "## B) Dead Ends（遷移が途切れるページ）\n\n";
  if (deadEnds.length === 0) {
    fix += "- なし\n\n";
  } else {
    for (const d of deadEnds) {
      fix += `- [ ] \`${d.page}\` に **戻る/ナビ/次ページ** のリンクを追加（out-degree=0）\n`;
    }
    fix += "\n";
  }

  fix += "## C) Broken（リンク/遷移エラー）\n\n";
  if ((flow.broken ?? []).length === 0) {
    fix += "- なし\n\n";
  } else {
    for (const b of (flow.broken ?? [])) {
      fix += `- [ ] from \`${b.from}\` / href \`${b.href}\` → ${b.reason}\n`;
    }
    fix += "\n";
  }

  await fs.writeFile(analysisJsonPath, JSON.stringify(analysisJson, null, 2), "utf8");
  await fs.writeFile(analysisMdPath, md, "utf8");
  await fs.writeFile(fixMdPath, fix, "utf8");

  await testInfo.attach("flow-analysis.json", { path: analysisJsonPath, contentType: "application/json" });
  await testInfo.attach("flow-analysis.md", { path: analysisMdPath, contentType: "text/markdown" });
  await testInfo.attach("link-fix-list.md", { path: fixMdPath, contentType: "text/markdown" });

  if (publish) {
    const docsDir = path.resolve(process.cwd(), "docs", "qa");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, "flow-analysis.json"), JSON.stringify(analysisJson, null, 2), "utf8");
    await fs.writeFile(path.join(docsDir, "flow-analysis.md"), md, "utf8");
    await fs.writeFile(path.join(docsDir, "link-fix-list.md"), fix, "utf8");
  }

  expect(true).toBeTruthy();
});
TS

# -------------------------
# Guided explore (prefer unvisited)
# -------------------------
write .qa/tests/exploratory/guided-coverage.spec.ts <<'TS'
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "../_support/test";
import { qa } from "../../qa.config";

type Edge = { from: string; to: string };

function normalizePathFromUrl(u: string): string {
  const url = new URL(u);
  let p = url.pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p;
}

function isSkippableHref(href: string): boolean {
  const h = href.trim();
  return (
    !h ||
    h === "#" ||
    h.startsWith("#") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.startsWith("javascript:")
  );
}

function makeRng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

test.describe.configure({ mode: "serial" });

test("guided explore (prefer unvisited nodes)", async ({ page }, testInfo) => {
  const seconds = Number(process.env.QA_EXPLORE_SECONDS ?? "120");
  const seed = Number(process.env.QA_EXPLORE_SEED ?? String(Date.now()));
  const publish = (process.env.QA_EXPLORE_PUBLISH ?? "0") === "1";

  test.setTimeout((seconds + 120) * 1000);

  const flowJsonPath =
    process.env.QA_FLOW_JSON ??
    path.join(qa.artifactsDir, "flow", "screen-flow.json");

  const flowRaw = await fs.readFile(flowJsonPath, "utf8");
  const flow = JSON.parse(flowRaw) as {
    meta: { startPath: string };
    pages: string[];
    edges: Edge[];
  };

  const base = qa.baseURL;
  const baseOrigin = new URL(base).origin;

  const targetSet = new Set<string>((flow.pages ?? []).map((p) => (p === "/" ? "/" : p.replace(/\/+$/, ""))));
  const rng = makeRng(seed);

  const startPath = process.env.QA_EXPLORE_START_PATH ?? flow?.meta?.startPath ?? "/";
  const startUrl = new URL(startPath, base).toString();

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });

  const visited = new Set<string>();
  const steps: Array<{ from: string; to: string; via: string }> = [];

  const deadline = Date.now() + seconds * 1000;

  async function goto(url: string) {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(qa.waitAfterGotoMs);

    const status = resp?.status?.();
    if (typeof status === "number" && status >= 400) {
      throw new Error(`HTTP ${status} at ${url}`);
    }
    if (errors.length > 0) {
      throw new Error(`Console/Page error at ${url}: ${errors.join(" | ")}`);
    }
  }

  await goto(startUrl);

  while (Date.now() < deadline) {
    const currentUrl = page.url();
    const currentPath = normalizePathFromUrl(currentUrl);
    visited.add(currentPath);

    const hrefs = await page.$$eval("a[href]", (as) =>
      as.map((a) => a.getAttribute("href") || "").filter(Boolean)
    );

    const candidates: Array<{ abs: string; path: string }> = [];

    for (const rawHref of hrefs.slice(0, 400)) {
      const href = String(rawHref).trim();
      if (isSkippableHref(href)) continue;

      let abs: string;
      try {
        abs = new URL(href, currentUrl).toString();
      } catch {
        continue;
      }

      const origin = new URL(abs).origin;
      if (origin !== baseOrigin) continue;

      const p = normalizePathFromUrl(abs);
      if (p === currentPath) continue;

      candidates.push({ abs, path: p });
    }

    // dedupe by path
    const byPath = new Map<string, string>();
    for (const c of candidates) if (!byPath.has(c.path)) byPath.set(c.path, c.abs);

    const deduped = Array.from(byPath.entries()).map(([p, abs]) => ({ path: p, abs }));

    if (deduped.length === 0) {
      // dead end: go back to start
      steps.push({ from: currentPath, to: normalizePathFromUrl(startUrl), via: "goto(start)" });
      await goto(startUrl);
      continue;
    }

    const unvisitedTargets = deduped.filter((c) => targetSet.has(c.path) && !visited.has(c.path));
    const unvisitedAny = deduped.filter((c) => !visited.has(c.path));

    const pool = unvisitedTargets.length > 0 ? unvisitedTargets : unvisitedAny.length > 0 ? unvisitedAny : deduped;

    const pick = pool[Math.floor(rng() * pool.length)];
    steps.push({ from: currentPath, to: pick.path, via: "goto(link)" });
    await goto(pick.abs);
  }

  // coverage report
  const visitedList = Array.from(visited).sort();
  const targets = Array.from(targetSet).sort();
  const uncovered = targets.filter((p) => !visited.has(p));

  const report = {
    meta: {
      baseURL: base,
      seed,
      seconds,
      startPath,
      generatedAt: new Date().toISOString(),
      flowJsonPath,
    },
    targetsCount: targets.length,
    visitedCount: visitedList.length,
    coverage: targets.length === 0 ? 1 : visitedList.filter((p) => targetSet.has(p)).length / targets.length,
    visited: visitedList,
    uncovered,
    steps,
  };

  const outDir = path.join(qa.artifactsDir, "explore");
  await fs.mkdir(outDir, { recursive: true });

  const outJson = path.join(outDir, "guided-coverage.json");
  await fs.writeFile(outJson, JSON.stringify(report, null, 2), "utf8");
  await testInfo.attach("guided-coverage.json", { path: outJson, contentType: "application/json" });

  if (publish) {
    const docsDir = path.resolve(process.cwd(), "docs", "qa");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, "guided-coverage.json"), JSON.stringify(report, null, 2), "utf8");
  }

  // Always attach seed + visited summary
  await testInfo.attach("guided-seed.txt", { body: String(seed), contentType: "text/plain" });
  await testInfo.attach("guided-visited.txt", { body: visitedList.join("\n"), contentType: "text/plain" });
  await testInfo.attach("guided-uncovered.txt", { body: uncovered.join("\n"), contentType: "text/plain" });

  expect(true).toBeTruthy();
});
TS

# -------------------------
# Runner script: execute + write runlog
# -------------------------
write .qa/run-flow-coverage.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# detect package manager
PM_RUN="npm run"
if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
  PM_RUN="pnpm"
elif [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
  PM_RUN="yarn"
fi

mkdir -p docs/qa

echo "== [1/3] qa:fixlist (flow + analyze + publish docs) =="
QA_FLOW_PUBLISH=1 $PM_RUN qa:fixlist

echo "== [2/3] guided explore (prefer unvisited) =="
QA_EXPLORE_SECONDS="${QA_EXPLORE_SECONDS:-60}" QA_EXPLORE_PUBLISH=1 $PM_RUN qa:explore:guided

echo "== [3/3] write docs/qa/QA_POCKET_RUNLOG.md =="
node <<'NODE'
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const analysisPath = path.resolve(root, ".qa", "artifacts", "flow", "flow-analysis.json");
const runlogPath = path.resolve(root, "docs", "qa", "QA_POCKET_RUNLOG.md");

let analysis = null;
try {
  analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
} catch (e) {
  console.error("ERROR: flow-analysis.json not found. Did qa:fixlist succeed?");
  process.exit(1);
}

const now = new Date().toISOString();
const counts = analysis.counts || {};
const unreachable = (analysis.unreachable || []).slice(0, 50);

let block = "";
block += `\n## Run ${now}\n\n`;
block += `Commands:\n`;
block += `- QA_FLOW_PUBLISH=1 qa:fixlist\n`;
block += `- QA_EXPLORE_SECONDS=${process.env.QA_EXPLORE_SECONDS || 60} qa:explore:guided\n\n`;
block += `Outputs (docs):\n`;
block += `- docs/qa/screen-flow.md\n`;
block += `- docs/qa/screen-flow.json\n`;
block += `- docs/qa/flow-analysis.md\n`;
block += `- docs/qa/flow-analysis.json\n`;
block += `- docs/qa/link-fix-list.md\n`;
block += `- docs/qa/guided-coverage.json\n\n`;
block += `Summary:\n`;
block += `- knownRoutes: ${counts.knownRoutes ?? "?"} (source: ${analysis.meta?.knownRoutesSource ?? "?"})\n`;
block += `- crawledPages: ${counts.crawledPages ?? "?"}\n`;
block += `- edges: ${counts.edges ?? "?"}\n`;
block += `- unreachable: ${counts.unreachable ?? "?"}\n`;
block += `- deadEnds: ${counts.deadEnds ?? "?"}\n`;
block += `- broken: ${counts.broken ?? "?"}\n`;
block += `- blockedExternalRequests: ${counts.blockedExternalRequests ?? "?"}\n\n`;

if (unreachable.length > 0) {
  block += `Top unreachable (first ${unreachable.length}):\n`;
  for (const u of unreachable) {
    const http = u.status === null ? "ERR" : String(u.status);
    const from = (u.suggestedFrom || []).slice(0, 4).join(", ");
    block += `- ${u.route} (HTTP ${http}) from: ${from}\n`;
  }
  block += `\n(See full list: docs/qa/link-fix-list.md)\n`;
} else {
  block += `No unreachable routes detected (or known-routes list is empty).\n`;
}

let text = "";
if (fs.existsSync(runlogPath)) {
  text = fs.readFileSync(runlogPath, "utf8");
} else {
  text = "# QA Pocket Run Log\n\nこのファイルは qa:fixlist / guided explore の実行ログを追記します。\n";
}
if (!text.endsWith("\n")) text += "\n";
text += block;

fs.mkdirSync(path.dirname(runlogPath), { recursive: true });
fs.writeFileSync(runlogPath, text, "utf8");

console.log("✅ wrote:", runlogPath);
NODE

echo "✅ Done. Check docs/qa/link-fix-list.md and docs/qa/QA_POCKET_RUNLOG.md"
SH

chmod +x .qa/run-flow-coverage.sh

# -------------------------
# Update package.json scripts
# -------------------------
node <<'NODE'
const fs = require("fs");
const path = require("path");
const pkgPath = path.resolve(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.scripts = pkg.scripts || {};

pkg.scripts["qa:flow"] = "playwright test -c .qa/playwright.config.ts .qa/tests/flow/screen-flow.spec.ts";
pkg.scripts["qa:flow:publish"] = "QA_FLOW_PUBLISH=1 playwright test -c .qa/playwright.config.ts .qa/tests/flow/screen-flow.spec.ts";
pkg.scripts["qa:flow:analyze"] = "playwright test -c .qa/playwright.config.ts .qa/tests/flow/flow-analyze.spec.ts";
pkg.scripts["qa:flow:analyze:publish"] = "QA_FLOW_PUBLISH=1 playwright test -c .qa/playwright.config.ts .qa/tests/flow/flow-analyze.spec.ts";
pkg.scripts["qa:fixlist"] =
  "QA_FLOW_PUBLISH=1 playwright test -c .qa/playwright.config.ts .qa/tests/flow/screen-flow.spec.ts && " +
  "QA_FLOW_PUBLISH=1 playwright test -c .qa/playwright.config.ts .qa/tests/flow/flow-analyze.spec.ts";
pkg.scripts["qa:explore:guided"] = "playwright test -c .qa/playwright.config.ts .qa/tests/exploratory/guided-coverage.spec.ts";

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("✅ updated package.json scripts");
NODE

# -------------------------
# Update AGENTS.md (QA_POCKET block)
# -------------------------
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

## Core commands
- Setup base pocket: \`bash .qa/setup.sh\`
- Setup flow/coverage addon: \`bash .qa/setup-flow-coverage.sh\`
- Run all (fixlist + guided explore + runlog): \`bash .qa/run-flow-coverage.sh\`

## Flow / Fix list
- Generate screen flow (artifacts): \`npm run qa:flow\`
- Generate screen flow (publish docs): \`npm run qa:flow:publish\`
- Analyze unreachable + fix list (publish docs): \`npm run qa:flow:analyze:publish\`
- One-shot fixlist (flow + analyze, publish docs): \`npm run qa:fixlist\`

## Explore
- Guided explore (prefer unvisited): \`QA_EXPLORE_SECONDS=120 npm run qa:explore:guided\`

## Config
- Screenshot/visual routes: \`.qa/routes.txt\`
- Unreachable target routes: \`.qa/known-routes.txt\`
- Flow params: QA_FLOW_START_PATH / QA_FLOW_MAX_PAGES / QA_FLOW_MAX_DEPTH / QA_FLOW_PUBLISH
- Explore params: QA_EXPLORE_SECONDS / QA_EXPLORE_SEED / QA_EXPLORE_START_PATH / QA_EXPLORE_PUBLISH

## Outputs
- Artifacts (gitignored): \`.qa/artifacts/\`
  - Flow: \`.qa/artifacts/flow/screen-flow.md|json\`
  - Analysis: \`.qa/artifacts/flow/flow-analysis.md|json\`, \`.qa/artifacts/flow/link-fix-list.md\`
  - Explore: \`.qa/artifacts/explore/guided-coverage.json\`
- Docs (committable): \`docs/qa/\`
  - screen-flow.*, flow-analysis.*, link-fix-list.md, guided-coverage.json, QA_POCKET_RUNLOG.md
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
console.log("✅ updated AGENTS.md");
NODE

# -------------------------
# Update .qa/README.md (marker append)
# -------------------------
node <<'NODE'
const fs = require("fs");
const path = require("path");

const file = path.resolve(process.cwd(), ".qa/README.md");
const START = "<!-- QA_FLOW_COVERAGE_START -->";
const END = "<!-- QA_FLOW_COVERAGE_END -->";

const block =
`${START}
## Extensions: Flow / Fix List / Guided Explore

### Flow (screen-flow.json/md)
- Generate flow artifacts:
  - \`npm run qa:flow\`
- Publish to docs/qa as well:
  - \`npm run qa:flow:publish\`

### Flow Analyze (unreachable + fix list)
- Analyze flow and generate fix list:
  - \`npm run qa:flow:analyze\`
- Publish docs:
  - \`npm run qa:flow:analyze:publish\`
- One-shot fixlist (flow + analyze, publish docs):
  - \`npm run qa:fixlist\`

Unreachable is computed as:
- \`.qa/known-routes.txt\` (expected routes)
  minus
- \`screen-flow.json\` pages (reachable via links)

### Guided Explore (prefer unvisited)
- \`QA_EXPLORE_SECONDS=120 npm run qa:explore:guided\`
- Publish JSON to docs:
  - set \`QA_EXPLORE_PUBLISH=1\`

### One command run (recommended)
- \`bash .qa/run-flow-coverage.sh\`

Outputs (committable):
- \`docs/qa/screen-flow.md|json\`
- \`docs/qa/flow-analysis.md|json\`
- \`docs/qa/link-fix-list.md\`
- \`docs/qa/guided-coverage.json\`
- \`docs/qa/QA_POCKET_RUNLOG.md\`
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
console.log("✅ updated .qa/README.md");
NODE

chmod +x .qa/setup-flow-coverage.sh

echo "✅ Installed Flow/Coverage addon."
echo "Next:"
echo "  bash .qa/run-flow-coverage.sh"
echo "  (edit .qa/known-routes.txt to improve unreachable detection)"
