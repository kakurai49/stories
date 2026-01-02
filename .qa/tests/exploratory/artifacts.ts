import fs from "node:fs/promises";
import path from "node:path";
import type { TestInfo } from "@playwright/test";
import type { ExploreConfig } from "./types";

export async function attachText(testInfo: TestInfo, name: string, body: string) {
  await testInfo.attach(name, {
    body,
    contentType: "text/plain",
  });
}

export async function writeGuidedCoverage(
  report: unknown,
  config: ExploreConfig,
  testInfo: TestInfo
): Promise<string> {
  const outDir = config.artifactsDir;
  await fs.mkdir(outDir, { recursive: true });

  const outJson = path.join(outDir, "guided-coverage.json");
  await fs.writeFile(outJson, JSON.stringify(report, null, 2), "utf8");
  await testInfo.attach("guided-coverage.json", { path: outJson, contentType: "application/json" });

  if (config.publish) {
    const docsDir = path.resolve(process.cwd(), "docs", "qa");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, "guided-coverage.json"), JSON.stringify(report, null, 2), "utf8");
  }

  return outJson;
}
