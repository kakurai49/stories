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
  const restartEvery = Number(process.env.QA_EXPLORE_RESTART_EVERY ?? "15");
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
  const blockedRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("requestfailed", (req) => {
    try {
      const origin = new URL(req.url()).origin;
      if (origin !== baseOrigin) blockedRequests.push(req.url());
    } catch {
      // ignore parse errors
    }
  });

  const visited = new Set<string>();
  const steps: Array<{ from: string; to: string; via: string }> = [];
  const recentPaths: string[] = [];
  const remember = (p: string) => {
    recentPaths.push(p);
    if (recentPaths.length > 5) recentPaths.shift();
  };

  const deadline = Date.now() + seconds * 1000;

  async function goto(url: string) {
    errors.length = 0;
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(qa.waitAfterGotoMs);

    const status = resp?.status?.();
    if (typeof status === "number" && status >= 400) {
      throw new Error(`HTTP ${status} at ${url}`);
    }
    if (errors.length > 0) {
      const nonNoise = errors.filter((e) => !/Failed to load resource/i.test(e));
      if (nonNoise.length > 0) {
        throw new Error(`Console/Page error at ${url}: ${nonNoise.join(" | ")}`);
      }
      errors.length = 0;
    }
  }

  await goto(startUrl);

  while (Date.now() < deadline) {
    const currentUrl = page.url();
    const currentPath = normalizePathFromUrl(currentUrl);
    visited.add(currentPath);
    remember(currentPath);

    if (restartEvery > 0 && steps.length > 0 && steps.length % restartEvery === 0) {
      const startPathNormalized = normalizePathFromUrl(startUrl);
      steps.push({ from: currentPath, to: startPathNormalized, via: "goto(restart)" });
      await goto(startUrl);
      continue;
    }

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
    const avoid = new Set(recentPaths);
    const filteredPool = pool.filter((c) => !avoid.has(c.path));
    const finalPool = filteredPool.length > 0 ? filteredPool : pool;

    const pick = finalPool[Math.floor(rng() * finalPool.length)];
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
      restartEvery,
      generatedAt: new Date().toISOString(),
      flowJsonPath,
    },
    targetsCount: targets.length,
    visitedCount: visitedList.length,
    coverage: targets.length === 0 ? 1 : visitedList.filter((p) => targetSet.has(p)).length / targets.length,
    visited: visitedList,
    uncovered,
    steps,
    blockedExternalRequests: Array.from(new Set(blockedRequests)).sort(),
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
