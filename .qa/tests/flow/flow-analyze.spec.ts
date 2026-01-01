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
