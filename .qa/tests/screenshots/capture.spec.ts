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
