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
    `${a.from}-->${a.to}`.localeCompare(`${b.from}-->${b.to}`)
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
