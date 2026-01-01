import { test, expect } from "../_support/test";
import { qa, safeRouteName } from "../../qa.config";

test.describe.configure({ mode: "serial" });

for (const route of qa.routes) {
  test(`visual: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(qa.waitAfterGotoMs);

    await expect(page).toHaveScreenshot(`${safeRouteName(route)}.png`, {
      fullPage: true,
    });
  });
}
