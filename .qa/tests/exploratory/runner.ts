import fs from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";
import { attachText, writeGuidedCoverage } from "./artifacts";
import { collectCandidates } from "./links";
import { createRng } from "./rng";
import type {
  ExploreConfig,
  ExploreContext,
  ExploreStrategy,
  FlowData,
} from "./types";
import { normalizePathFromUrl } from "./types";

export type RunExploreOptions = {
  page: Page;
  testInfo: TestInfo;
  strategy: ExploreStrategy;
  config: ExploreConfig;
};

type Navigator = {
  goto: (url: string) => Promise<void>;
  errors: string[];
  blockedExternalRequests: string[];
};

function rememberRecent(recent: string[], path: string) {
  recent.push(path);
  if (recent.length > 5) recent.shift();
}

async function loadFlowData(flowJsonPath: string): Promise<FlowData> {
  const raw = await fs.readFile(flowJsonPath, "utf8");
  return JSON.parse(raw) as FlowData;
}

function createNavigator(
  page: Page,
  history: string[],
  waitAfterGotoMs: number,
  baseOrigin: string,
  mode: "random" | "guided",
  errors: string[],
  blockedFromTestInfo: string[]
): Navigator {
  const blockedExternalRequests: string[] = [];

  if (mode === "random") {
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;

      const text = msg.text();
      const isBlockedErr = text.includes("Failed to load resource: net::ERR_FAILED");
      if (isBlockedErr && blockedFromTestInfo.length > 0) return;

      errors.push(`console: ${text}`);
    });

    return {
      goto: async (url: string) => {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(waitAfterGotoMs);

        history.push(url);

        const status = resp?.status?.();
        if (typeof status === "number" && status >= 400) {
          throw new Error(`HTTP ${status} at ${url}`);
        }

        if (errors.length > 0) {
          throw new Error(`Console/Page error at ${url}: ${errors.join(" | ")}`);
        }
      },
      errors,
      blockedExternalRequests,
    };
  }

  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("requestfailed", (req) => {
    try {
      const origin = new URL(req.url()).origin;
      if (origin !== baseOrigin) blockedExternalRequests.push(req.url());
    } catch {
      // ignore parse errors
    }
  });

  return {
    goto: async (url: string) => {
      errors.length = 0;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(waitAfterGotoMs);

      const status = resp?.status?.();
      if (typeof status === "number" && status >= 400) {
        throw new Error(`HTTP ${status} at ${url}`);
      }

      if (errors.length > 0) {
        const nonNoise = errors.filter((e) => !/Failed to load resource/i.test(e));
        if (nonNoise.length > 0) {
          throw new Error(`Console/Page error at ${url}: ${nonNoise.join(" | ")}`);
        }
        errors.length = 0;
      }
    },
    errors,
    blockedExternalRequests,
  };
}

export async function runExplore({ page, testInfo, strategy, config }: RunExploreOptions) {
  const rng = createRng(config.seed);
  const baseOrigin = new URL(config.baseURL).origin;
  const history: string[] = [];
  const errors: string[] = [];
  const visited = new Set<string>();
  const recent: string[] = [];
  const steps: Array<{ from: string; to: string; via: string }> = [];
  const blockedFromTestInfo = ((testInfo as any)._blockedRequests ?? []) as string[];

  const flowLoader = () => loadFlowData(config.flowJsonPath);
  const initResult = strategy.init ? await strategy.init({ config, loadFlow: flowLoader }) : undefined;
  const targetSet = initResult?.targetSet;
  if (initResult?.startPath) config.startPath = initResult.startPath;

  const startUrl = new URL(config.startPath, config.baseURL).toString();
  const startPathNormalized = normalizePathFromUrl(startUrl);
  const deadline = Date.now() + config.seconds * 1000;

  const navigator = createNavigator(
    page,
    history,
    config.waitAfterGotoMs,
    baseOrigin,
    strategy.name === "guided-coverage" ? "guided" : "random",
    errors,
    blockedFromTestInfo
  );

  const perform = async () => {
    await navigator.goto(startUrl);

    while (Date.now() < deadline) {
      const currentUrl = page.url();
      const currentPath = normalizePathFromUrl(currentUrl);
      visited.add(currentPath);
      rememberRecent(recent, currentPath);

      const candidates = await collectCandidates({
        page,
        baseOrigin,
        currentUrl,
        currentPath,
        limit: strategy.candidateLimit,
        dedupeByPath: strategy.dedupeByPath,
        skipSelf: strategy.skipSelf,
        skipBeforeSlice: strategy.skipBeforeSlice,
      });

      const ctx: ExploreContext = {
        page,
        testInfo,
        config,
        rng,
        baseURL: config.baseURL,
        baseOrigin,
        startUrl,
        currentUrl,
        currentPath,
        candidates,
        visited,
        recent,
        history,
        errors,
        blockedRequests: navigator.blockedExternalRequests,
        targetSet,
        stepIndex: steps.length,
      };

      const action = strategy.nextAction(ctx);
      if (action.action === "stop") break;

      if (action.action === "restart") {
        if (strategy.name === "guided-coverage") {
          steps.push({ from: currentPath, to: startPathNormalized, via: action.via ?? "goto(start)" });
        }
        await navigator.goto(startUrl);
        continue;
      }

      if (strategy.name === "guided-coverage") {
        const toPath = action.targetPath ?? normalizePathFromUrl(action.url);
        steps.push({ from: currentPath, to: toPath, via: action.via ?? "goto(link)" });
      }

      await navigator.goto(action.url);
    }
  };

  if (strategy.name === "random-walk") {
    try {
      await perform();
    } finally {
      await attachText(testInfo, "explore-seed.txt", String(config.seed));
      await attachText(testInfo, "explore-history.txt", history.join("\n"));
      if (errors.length > 0) {
        await attachText(testInfo, "explore-errors.txt", errors.join("\n"));
      }
    }
    return;
  }

  await perform();

  const visitedList = Array.from(visited).sort();
  const targets = Array.from(targetSet ?? new Set<string>()).sort();
  const uncovered = targets.filter((p) => !visited.has(p));
  const coverage = targets.length === 0 ? 1 : visitedList.filter((p) => targetSet?.has(p)).length / targets.length;

  const report = {
    meta: {
      baseURL: config.baseURL,
      seed: config.seed,
      seconds: config.seconds,
      startPath: config.startPath,
      restartEvery: config.restartEvery,
      generatedAt: new Date().toISOString(),
      flowJsonPath: config.flowJsonPath,
    },
    targetsCount: targets.length,
    visitedCount: visitedList.length,
    coverage,
    visited: visitedList,
    uncovered,
    steps,
    blockedExternalRequests: Array.from(new Set(navigator.blockedExternalRequests)).sort(),
  };

  await writeGuidedCoverage(report, config, testInfo);
  await attachText(testInfo, "guided-seed.txt", String(config.seed));
  await attachText(testInfo, "guided-visited.txt", visitedList.join("\n"));
  await attachText(testInfo, "guided-uncovered.txt", uncovered.join("\n"));
}
