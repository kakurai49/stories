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
  const blocked = ((testInfo as any)._blockedRequests ?? []) as string[];

  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;

    const text = msg.text();
    const isBlockedErr = text.includes("Failed to load resource: net::ERR_FAILED");
    if (isBlockedErr && blocked.length > 0) return;

    errors.push(`console: ${text}`);
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
