import { test } from "../_support/test";
import { loadExploreConfig } from "./env";
import { runExplore } from "./runner";
import { getStrategy } from "./strategies";

test.describe.configure({ mode: "serial" });

test("guided explore (prefer unvisited nodes)", async ({ page }, testInfo) => {
  const config = loadExploreConfig({ defaultStrategy: "guided-coverage" });
  test.setTimeout((config.seconds + 120) * 1000);

  const strategy = getStrategy(config.strategyName);
  await runExplore({ page, testInfo, strategy, config });
});
