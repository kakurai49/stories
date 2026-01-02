import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { qa } from "../../qa.config";

type Edge = { from: string; to: string };
type Broken = { from: string; href: string; reason: string };
type AggregatedBroken = {
  target: string;
  hrefSamples: string[];
  reasons: string[];
  inbound: string[];
  suggestions: string[];
};

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

function buildInbound(edges: Edge[]): Map<string, Set<string>> {
  const inbound = new Map<string, Set<string>>();
  for (const e of edges) {
    const from = normalizePath(e.from);
    const to = normalizePath(e.to);
    if (!inbound.has(to)) inbound.set(to, new Set());
    inbound.get(to)!.add(from);
  }
  return inbound;
}

function aggregateCounts(items: string[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const raw of items ?? []) {
    const key = (raw || "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function commonSuffixLength(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length) {
    if (a[a.length - 1 - i] !== b[b.length - 1 - i]) break;
    i += 1;
  }
  return i;
}

function suggestReplacements(target: string, flowPages: Set<string>, limit = 5): string[] {
  const t = normalizePath(target);
  const tSegs = t.split("/").filter(Boolean);
  if (tSegs.length === 0) return [];

  const scored: Array<{ page: string; score: number }> = [];
  for (const page of flowPages) {
    if (page === t) continue;
    const segs = page.split("/").filter(Boolean);
    const suffix = commonSuffixLength(tSegs, segs);
    if (suffix === 0) continue;

    const sameRoot = tSegs[0] === segs[0];
    const score = suffix * 2 + (sameRoot ? 1 : 0) + (segs.length === tSegs.length ? 0.5 : 0);
    scored.push({ page, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.page.localeCompare(b.page))
    .slice(0, limit)
    .map((s) => s.page);
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
  const inbound = buildInbound(edges);

  const brokenAggregated = (() => {
    const map = new Map<string, { target: string; hrefs: Set<string>; reasons: Set<string> }>();
    for (const b of flow.broken ?? []) {
      const target = normalizePath(b.href);
      const entry = map.get(target) ?? {
        target,
        hrefs: new Set<string>(),
        reasons: new Set<string>(),
      };
      entry.hrefs.add(b.href);
      entry.reasons.add(b.reason);
      map.set(target, entry);
      const from = normalizePath(b.from);
      if (!inbound.has(target)) inbound.set(target, new Set());
      inbound.get(target)!.add(from);
    }

    return Array.from(map.values())
      .map<AggregatedBroken>((v) => ({
        target: v.target,
        hrefSamples: Array.from(v.hrefs).sort().slice(0, 3),
        reasons: Array.from(v.reasons).sort(),
        inbound: Array.from(inbound.get(v.target) ?? [])
          .sort()
          .slice(0, 20),
        suggestions: suggestReplacements(v.target, flowPages),
      }))
      .sort((a, b) => a.target.localeCompare(b.target));
  })();
  const brokenTargetSet = new Set(brokenAggregated.map((b) => b.target));

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
  const deadEndsOk = deadEnds.filter((d) => !brokenTargetSet.has(d.page));

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

  const consoleErrors = aggregateCounts(flow.consoleErrors ?? []);
  const blockedExternalRequests = aggregateCounts(flow.blockedExternalRequests ?? []);
  const counts = {
    knownRoutes: knownRoutes.length,
    crawledPages: flowPages.size,
    edges: edges.length,
    unreachable: unreachableChecked.length,
    deadEnds: deadEnds.length,
    deadEndsOk: deadEndsOk.length,
    orphans: orphans.length,
    broken: brokenAggregated.length,
    brokenRaw: (flow.broken ?? []).length,
    consoleErrors: consoleErrors.length,
    consoleErrorsTotal: (flow.consoleErrors ?? []).length,
    consoleErrorsUnique: consoleErrors.length,
    blockedExternalRequests: blockedExternalRequests.length,
    blockedExternalRequestsTotal: (flow.blockedExternalRequests ?? []).length,
    blockedExternalRequestsUnique: blockedExternalRequests.length,
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
  md += `- deadEndsOk: ${deadEndsOk.length}\n`;
  md += `- broken: ${counts.broken} (raw: ${counts.brokenRaw})\n`;
  md += `- consoleErrors: uniq ${counts.consoleErrorsUnique} / total ${counts.consoleErrorsTotal}\n`;
  md += `- blockedExternalRequests: uniq ${counts.blockedExternalRequestsUnique} / total ${counts.blockedExternalRequestsTotal}\n\n`;

  md += "## Top Hubs（リンクが多いページ）\n\n";
  for (const h of hubs) md += `- ${h.page} (out=${h.out})\n`;
  md += "\n";

  if (orphans.length > 0) {
    md += "## Orphans（流入が0のページ）\n\n";
    for (const o of orphans.slice(0, 200)) md += `- ${o.page}\n`;
    if (orphans.length > 200) md += `\n…and ${orphans.length - 200} more\n`;
    md += "\n";
  }

  if (deadEndsOk.length > 0) {
    md += "## Dead Ends OK（broken を除く、遷移先リンクが見つからないページ）\n\n";
    for (const d of deadEndsOk.slice(0, 200)) md += `- ${d.page}\n`;
    if (deadEndsOk.length > 200) md += `\n…and ${deadEndsOk.length - 200} more\n`;
    md += "\n";
  }

  if (brokenAggregated.length > 0) {
    md += "## Broken（移動失敗・HTTP>=400 等）\n\n";
    for (const b of brokenAggregated.slice(0, 200)) {
      const inboundList = b.inbound.map((f) => `\`${f}\``).join(", ");
      const suggestions = b.suggestions.map((s) => `\`${s}\``).join(", ");
      const reasons = b.reasons.join(" / ");
      const hrefs = b.hrefSamples.map((h) => `\`${h}\``).join(", ");
      md += `- target: \`${b.target}\`\n`;
      md += `  - href samples: ${hrefs}\n`;
      md += `  - reason: ${reasons}\n`;
      md += `  - inbound: ${inboundList || "(none)"}\n`;
      md += `  - 置換候補: ${suggestions || "(なし)"}\n`;
    }
    if (brokenAggregated.length > 200) md += `\n…and ${brokenAggregated.length - 200} more\n`;
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

  if (consoleErrors.length > 0) {
    md += "## Console Errors（ユニーク）\n\n";
    for (const c of consoleErrors.slice(0, 200)) {
      md += `- (${c.count}) ${c.value}\n`;
    }
    if (consoleErrors.length > 200) md += `\n…and ${consoleErrors.length - 200} more\n`;
    md += "\n";
  }

  if (blockedExternalRequests.length > 0) {
    md += "## Blocked External Requests（ユニーク外部アクセス遮断ログ）\n\n";
    for (const u of blockedExternalRequests.slice(0, 200)) md += `- (${u.count}) ${u.value}\n`;
    if (blockedExternalRequests.length > 200) md += `\n…and ${blockedExternalRequests.length - 200} more\n`;
    md += "\n";
  }

  // link-fix-list.md (action list)
  let fix = "";
  fix += "# リンク不足 修正リスト（自動生成）\n\n";
  fix += `- baseURL: ${baseURL}\n`;
  fix += `- startPath: ${startPath}\n`;
  fix += `- knownRoutes: ${counts.knownRoutes}（source: ${known.source}）\n`;
  fix += `- unreachable: ${counts.unreachable}\n`;
  fix += `- deadEndsOk: ${deadEndsOk.length}\n`;
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

  fix += "## B) Dead Ends（broken を除く、遷移が途切れるページ）\n\n";
  if (deadEndsOk.length === 0) {
    fix += "- なし\n\n";
  } else {
    for (const d of deadEndsOk) {
      fix += `- [ ] \`${d.page}\` に **戻る/ナビ/次ページ** のリンクを追加（out-degree=0）\n`;
    }
    fix += "\n";
  }

  fix += "## C) Broken（リンク/遷移エラー）\n\n";
  if (brokenAggregated.length === 0) {
    fix += "- なし\n\n";
  } else {
    for (const b of brokenAggregated) {
      const inboundList = b.inbound.map((f) => `\`${f}\``).join(", ");
      const suggestions = b.suggestions.map((s) => `\`${s}\``).join(", ");
      const reasons = b.reasons.join(" / ");
      fix += `- [ ] target \`${b.target}\` (${reasons})\n`;
      fix += `  - リンク元: ${inboundList || "(not recorded)"}\n`;
      fix += `  - 置換候補: ${suggestions || "(なし)"}\n`;
      if (b.hrefSamples.length > 0) {
        fix += `  - href samples: ${b.hrefSamples.map((h) => `\`${h}\``).join(", ")}\n`;
      }
    }
    fix += "\n";
  }

  await fs.writeFile(
    analysisJsonPath,
    JSON.stringify(
      {
        ...analysisJson,
        deadEndsOk,
        brokenRaw: flow.broken ?? [],
        brokenAggregated,
        consoleErrors,
        blockedExternalRequests,
      },
      null,
      2
    ),
    "utf8"
  );
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
