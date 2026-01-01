import { defineConfig } from "@playwright/test";
import path from "node:path";
import { qa } from "./qa.config";

export default defineConfig({
  testDir: path.join(qa.pocketDir, "tests"),
  outputDir: path.join(qa.artifactsDir, "test-results"),
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(qa.artifactsDir, "playwright-report") }],
  ],

  use: {
    baseURL: qa.baseURL,
    browserName: "chromium",
    headless: true,

    viewport: { width: 1280, height: 720 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",

    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },

  // Always start local dev server (no file:// mode)
  webServer: {
    command: qa.webCommand,
    url: qa.baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
