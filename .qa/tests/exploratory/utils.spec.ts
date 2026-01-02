import { expect, test } from "@playwright/test";
import { collectCandidates } from "./links";
import { createRng } from "./rng";
import { normalizePathFromUrl } from "./types";

test.describe("explore utilities", () => {
  test("rng produces deterministic sequence", () => {
    const rng = createRng(42);
    const numbers = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()];
    expect(numbers).toEqual([
      0.0026438925421433273,
      0.6603119775327649,
      0.11095708681059933,
      0.8493769021819757,
      0.8754393916752746,
    ]);

    const rng2 = createRng(42);
    const ints = [rng2.nextInt(10), rng2.nextInt(10), rng2.nextInt(10), rng2.nextInt(10), rng2.nextInt(10)];
    expect(ints).toEqual([0, 6, 1, 8, 8]);
  });

  test("normalizePathFromUrl trims trailing slash but preserves root", () => {
    expect(normalizePathFromUrl("https://example.com/foo/bar/")).toBe("/foo/bar");
    expect(normalizePathFromUrl("https://example.com/")).toBe("/");
  });

  test("collectCandidates filters skippable hrefs before slicing when requested", async ({ page }) => {
    await page.setContent(`
      <a href="mailto:test@example.com">mail</a>
      <a href="/next">next</a>
      <a href="/other">other</a>
    `);

    const candidates = await collectCandidates({
      page,
      baseOrigin: "http://example.com",
      currentUrl: "http://example.com/start",
      currentPath: "/start",
      limit: 2,
      dedupeByPath: false,
      skipSelf: false,
      skipBeforeSlice: true,
    });

    expect(candidates.map((c) => c.path)).toEqual(["/next", "/other"]);
  });

  test("collectCandidates slices before skipping when configured", async ({ page }) => {
    await page.setContent(`
      <a href="mailto:test@example.com">mail</a>
      <a href="/keep">keep</a>
      <a href="/ignore">ignore</a>
    `);

    const candidates = await collectCandidates({
      page,
      baseOrigin: "http://example.com",
      currentUrl: "http://example.com/start",
      currentPath: "/start",
      limit: 2,
      dedupeByPath: true,
      skipSelf: true,
      skipBeforeSlice: false,
    });

    expect(candidates.map((c) => c.path)).toEqual(["/keep"]);
  });

  test("collectCandidates dedupes by path and skips self when requested", async ({ page }) => {
    await page.setContent(`
      <a href="/dup">dup1</a>
      <a href="/dup#hash">dup2</a>
      <a href="/start">self</a>
    `);

    const candidates = await collectCandidates({
      page,
      baseOrigin: "http://example.com",
      currentUrl: "http://example.com/start",
      currentPath: "/start",
      limit: 10,
      dedupeByPath: true,
      skipSelf: true,
      skipBeforeSlice: false,
    });

    expect(candidates).toEqual([{ href: "/dup", abs: "http://example.com/dup", path: "/dup" }]);
  });
});
