import { test } from "../_support/test";
import { loadExploreConfig } from "./env";
import { runExplore } from "./runner";
import { getStrategy } from "./strategies";

test.describe.configure({ mode: "serial" });

test("exploratory: random walk (timeboxed)", async ({ page }, testInfo) => {
  const config = loadExploreConfig({ defaultStrategy: "random-walk" });
  test.setTimeout((config.seconds + 60) * 1000);

  const strategy = getStrategy(config.strategyName);
  await runExplore({ page, testInfo, strategy, config });
});
