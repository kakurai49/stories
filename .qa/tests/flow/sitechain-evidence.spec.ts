import fs from "node:fs/promises";
import path from "node:path";
import { test } from "../_support/test";
import { qa, safeRouteName } from "../../qa.config";

type BrokenEntry = {
  target: string;
  referers: string[];
};

type AnchorEvidence = {
  text: string;
  hrefRaw: string;
  hrefResolved: string;
  resolvedPath: string;
  brokenResolvedPath: string;
  outerHTML: string;
};

type RefererScan = {
  referer: string;
  url: string;
  status: number | null;
  anchors: AnchorEvidence[];
  screenshot?: string;
};

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const docsQaDir = path.resolve(repoRoot, "docs", "qa");
const imgDir = path.resolve(docsQaDir, "img");

async function pickFirstExisting(paths: string[]): Promise<string> {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep searching
    }
  }
  throw new Error(`No broken-with-referers.json found. Tried: ${paths.join(", ")}`);
}

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  let p = pathname.replace(/[?#].*$/, "");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

test.describe.configure({ mode: "serial" });

test("sitechain broken link evidence", async ({ page }) => {
  const brokenPath = await pickFirstExisting([
    path.join(docsQaDir, "broken-with-referers.json"),
    path.join(repoRoot, ".qa", "artifacts", "flow", "broken-with-referers.json"),
  ]);
  const brokenPayload = JSON.parse(await fs.readFile(brokenPath, "utf8"));
  const entries: BrokenEntry[] = brokenPayload.out ?? [];
  const targets = new Set(entries.map((e) => e.target));

  await fs.mkdir(imgDir, { recursive: true });

  const referers = Array.from(new Set(entries.flatMap((e) => e.referers)));
  const scans: Record<string, RefererScan> = {};

  for (const referer of referers) {
    const url = new URL(referer, qa.baseURL).toString();
    const brokenBase = new URL(referer, qa.baseURL).toString();
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(qa.waitAfterGotoMs);

    const anchors = await page.$$eval(
      "a[href]",
      (nodes, context) => {
        const normalize = (raw: string): string => {
          try {
            const u = new URL(raw);
            let p = u.pathname || "/";
            p = p.replace(/[?#].*$/, "");
            if (p.length > 1) p = p.replace(/\/+$/, "");
            if (!p.startsWith("/")) p = `/${p}`;
            return p || "/";
          } catch {
            return "";
          }
        };

        return nodes.map((node) => {
          const a = node as HTMLAnchorElement;
          const hrefRaw = a.getAttribute("href") || "";
          const hrefResolved = a.href || "";
          let brokenResolved = "";
          try {
            brokenResolved = new URL(hrefRaw, context.brokenBase).href;
          } catch {
            brokenResolved = hrefResolved;
          }
          return {
            text: (a.textContent || "").trim(),
            hrefRaw,
            hrefResolved,
            resolvedPath: normalize(hrefResolved),
            brokenResolvedPath: normalize(brokenResolved),
            outerHTML: a.outerHTML,
          };
        });
      },
      { brokenBase }
    );

    const hasTarget = anchors.some(
      (a) => targets.has(a.resolvedPath) || targets.has(a.brokenResolvedPath)
    );
    let screenshot: string | undefined;
    if (hasTarget) {
      const shotName = `sitechain-${safeRouteName(referer)}.png`;
      const shotPath = path.join(imgDir, shotName);
      await page.screenshot({ path: shotPath, fullPage: true });
      screenshot = path.relative(repoRoot, shotPath);
    }

    scans[referer] = {
      referer,
      url,
      status: response?.status?.() ?? null,
      anchors,
      screenshot,
    };
  }

  const results = entries.flatMap((entry) =>
    entry.referers.map((referer) => {
      const scan = scans[referer];
      const matches = (scan?.anchors ?? []).filter(
        (a) =>
          normalizePath(a.resolvedPath) === normalizePath(entry.target) ||
          normalizePath(a.brokenResolvedPath) === normalizePath(entry.target)
      );
      return {
        target: entry.target,
        referer,
        refererUrl: scan?.url ?? new URL(referer, qa.baseURL).toString(),
        refererStatus: scan?.status ?? null,
        screenshot: scan?.screenshot,
        matches,
      };
    })
  );

  const outPath = path.join(docsQaDir, "sitechain-link-evidence.json");
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseURL: qa.baseURL,
        brokenSource: path.relative(repoRoot, brokenPath),
        results,
      },
      null,
      2
    )
  );
});
