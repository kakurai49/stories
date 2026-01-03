import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loadExploreConfig } from "./env";
import { runExplore } from "./runner";
import { guidedCoverageStrategy } from "./strategies/guided-coverage";
import { randomWalkStrategy } from "./strategies/random-walk";
import type { ExploreStrategy } from "./types";

function startTestServer(routes: Record<string, string>): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url || "/";
      if (url === "/bad" || url === "/fail") {
        res.statusCode = 500;
        res.end("bad");
        return;
      }

    const body = routes[url] ?? "";
    res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(body);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test.describe.configure({ mode: "serial" });

test("random-walk runner records history and errors on HTTP failures", async ({ browser }, testInfo) => {
  const { server, url } = await startTestServer({
    "/start": '<a href="/a">A</a><a href="mailto:test@example.com">mail</a>',
    "/a": '<a href="/bad">Bad</a>',
    "/bad": "",
  });

  const context = await browser.newContext({ baseURL: url });
  const page = await context.newPage();

  const config = loadExploreConfig({
    defaultStrategy: "random-walk",
    baseURL: url,
    artifactsDir: testInfo.outputPath("artifacts"),
    startPath: "/start",
    seconds: 2,
    seed: 42,
    waitAfterGotoMs: 0,
  });

  const run = runExplore({ page, testInfo, strategy: randomWalkStrategy, config });
  await expect(run).rejects.toThrow(/HTTP 500/);

  const attachmentNames = testInfo.attachments.map((a) => a.name);
  expect(attachmentNames).toEqual(expect.arrayContaining(["explore-history.txt", "explore-errors.txt", "explore-seed.txt"]));

  const historyAttachment = testInfo.attachments.find((a) => a.name === "explore-history.txt");
  const history = historyAttachment?.body?.toString?.() ?? "";
  expect(history).toContain("/bad");

  await context.close();
  await new Promise((resolve) => server.close(resolve));
});

test("guided-coverage runner writes coverage artifact and visits targets", async ({ browser }, testInfo) => {
  const { server, url } = await startTestServer({
    "/start": '<a href="/c">C</a><a href="/b">B</a>',
    "/b": '<a href="/c">to C</a>',
    "/c": "target",
  });

  const flowPath = path.join(testInfo.outputPath(), "flow.json");
  await fs.writeFile(
    flowPath,
    JSON.stringify({ meta: { startPath: "/start" }, pages: ["/c"], edges: [] }, null, 2),
    "utf8"
  );

  const context = await browser.newContext({ baseURL: url });
  const page = await context.newPage();

  const config = loadExploreConfig({
    defaultStrategy: "guided-coverage",
    baseURL: url,
    artifactsDir: testInfo.outputPath("artifacts"),
    flowJsonPath: flowPath,
    seconds: 2,
    seed: 7,
    waitAfterGotoMs: 0,
  });

  await runExplore({ page, testInfo, strategy: guidedCoverageStrategy, config });

  const coveragePath = path.join(config.artifactsDir, "guided-coverage.json");
  const content = await fs.readFile(coveragePath, "utf8");
  const report = JSON.parse(content);
  expect(report.visited).toContain("/c");
  expect(report.meta.startPath).toBe("/start");

  await context.close();
  await new Promise((resolve) => server.close(resolve));
});

test("runner forwards feedback and onEnd even on failures", async ({ browser }, testInfo) => {
  const { server, url } = await startTestServer({
    "/start": '<a href="/fail">fail</a>',
    "/fail": "",
  });

  const context = await browser.newContext({ baseURL: url });
  const page = await context.newPage();

  const feedback: any[] = [];
  let ended = false;
  const strategy: ExploreStrategy = {
    name: "feedback-probe",
    candidateLimit: 50,
    dedupeByPath: true,
    skipSelf: true,
    skipBeforeSlice: true,
    nextAction: ({ candidates }) => {
      return { action: "goto", url: candidates[0].abs, targetPath: candidates[0].path, via: "goto(link)" };
    },
    onFeedback: (fb) => {
      feedback.push(fb);
    },
    onEnd: () => {
      ended = true;
    },
  };

  const config = loadExploreConfig({
    defaultStrategy: strategy.name,
    baseURL: url,
    artifactsDir: testInfo.outputPath("artifacts"),
    startPath: "/start",
    seconds: 2,
    seed: 99,
    waitAfterGotoMs: 0,
  });

  const run = runExplore({ page, testInfo, strategy, config });
  await expect(run).rejects.toThrow();

  expect(feedback).toHaveLength(1);
  expect(feedback[0].toPath).toBe("/fail");
  expect(feedback[0].errors?.httpStatusGE400).toBe(true);
  expect(ended).toBe(true);

  await context.close();
  await new Promise((resolve) => server.close(resolve));
});
