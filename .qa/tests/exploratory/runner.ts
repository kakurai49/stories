import fs from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";
import { attachText, writeGuidedCoverage } from "./artifacts";
import { collectCandidates } from "./links";
import { createRng } from "./rng";
import { createCoverageState, recordCandidateSeen, updateCoverage } from "./coverage";
import type {
  ExploreConfig,
  ExploreContext,
  ExploreStrategy,
  FlowData,
} from "./types";
import { normalizePathFromUrl } from "./types";
import { createBenchmarkRecorder } from "./bench-logger";

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
  blockedFromTestInfo: string[],
  resetCoverage: () => void,
  recordBenchError?: (err: { type: "http" | "console" | "pageerror" | "navigation"; message: string; url?: string; status?: number }) => void
): Navigator {
  const blockedExternalRequests: string[] = [];

  if (mode === "random") {
    page.on("pageerror", (e) => {
      const msg = `pageerror: ${String(e)}`;
      errors.push(msg);
      recordBenchError?.({ type: "pageerror", message: msg });
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;

      const text = msg.text();
      const isBlockedErr = text.includes("Failed to load resource: net::ERR_FAILED");
      if (isBlockedErr && blockedFromTestInfo.length > 0) return;

      errors.push(`console: ${text}`);
      recordBenchError?.({ type: "console", message: text });
    });

    return {
      goto: async (url: string) => {
        resetCoverage();
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(waitAfterGotoMs);

        history.push(url);

        const status = resp?.status?.();
        if (typeof status === "number" && status >= 400) {
          recordBenchError?.({ type: "http", message: `HTTP ${status} at ${url}`, url, status });
          throw new Error(`HTTP ${status} at ${url}`);
        }

        if (errors.length > 0) {
          recordBenchError?.({ type: "navigation", message: errors.join(" | "), url });
          throw new Error(`Console/Page error at ${url}: ${errors.join(" | ")}`);
        }
      },
      errors,
      blockedExternalRequests,
    };
  }

  page.on("pageerror", (e) => {
    const msg = `pageerror: ${String(e)}`;
    errors.push(msg);
    recordBenchError?.({ type: "pageerror", message: msg });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      errors.push(`console: ${text}`);
      recordBenchError?.({ type: "console", message: text });
    }
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
      resetCoverage();
      errors.length = 0;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(waitAfterGotoMs);

      const status = resp?.status?.();
      if (typeof status === "number" && status >= 400) {
        recordBenchError?.({ type: "http", message: `HTTP ${status} at ${url}`, url, status });
        throw new Error(`HTTP ${status} at ${url}`);
      }

      if (errors.length > 0) {
        const nonNoise = errors.filter((e) => !/Failed to load resource/i.test(e));
        if (nonNoise.length > 0) {
          recordBenchError?.({ type: "navigation", message: nonNoise.join(" | "), url });
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
  const coverage = createCoverageState();
  const observedSinceLastGoto = new Set<string>();
  const bench = createBenchmarkRecorder({ config, strategyName: strategy.name });
  let stepIndex = 0;

  page.on("requestfinished", (req) => {
    try {
      const url = new URL(req.url());
      if (url.origin !== baseOrigin) return;

      const path = normalizePathFromUrl(url.toString());
      const resourceType = req.resourceType();
      if (resourceType === "xhr" || resourceType === "fetch") {
        observedSinceLastGoto.add(`api:${req.method().toUpperCase()} ${path}`);
        bench.recordRequest(path, "api", req.method().toUpperCase());
      } else if (resourceType === "script" || resourceType === "stylesheet") {
        observedSinceLastGoto.add(`asset:${path}`);
        bench.recordRequest(path, "asset", req.method().toUpperCase());
      } else if (resourceType === "document") {
        observedSinceLastGoto.add(`route:${path}`);
        bench.recordRequest(path, "route", req.method().toUpperCase());
      } else {
        bench.recordRequest(path, "other", req.method().toUpperCase());
      }
    } catch {
      // ignore malformed URLs
    }
  });

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
    strategy.name === "random-walk" ? "random" : "guided",
    errors,
    blockedFromTestInfo,
    () => observedSinceLastGoto.clear(),
    bench.enabled
      ? (err) =>
          bench.recordError({
            type: err.type,
            message: err.message,
            url: err.url,
            status: err.status,
            at: new Date().toISOString(),
          })
      : undefined
  );

  const perform = async () => {
    await navigator.goto(startUrl);

    while (Date.now() < deadline) {
      const currentUrl = page.url();
      const currentPath = normalizePathFromUrl(currentUrl);
      const observedForPage = new Set<string>(observedSinceLastGoto);
      observedForPage.add(`route:${currentPath}`);
      updateCoverage(coverage, currentPath, observedForPage);
      observedSinceLastGoto.clear();
      visited.add(currentPath);
      rememberRecent(recent, currentPath);
      bench.recordVisit(currentPath);

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
      recordCandidateSeen(coverage, candidates);

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
        coverage,
      };

      const action = strategy.nextAction(ctx);
      bench.recordStep({ stepIndex, from: currentPath, action, candidates, coverage, visited });
      if (action.action === "stop") break;

      if (action.action === "restart") {
        if (strategy.name !== "random-walk") {
          steps.push({ from: currentPath, to: startPathNormalized, via: action.via ?? "goto(start)" });
        }
        await navigator.goto(startUrl);
        stepIndex += 1;
        continue;
      }

      if (strategy.name !== "random-walk") {
        const toPath = action.targetPath ?? normalizePathFromUrl(action.url);
        steps.push({ from: currentPath, to: toPath, via: action.via ?? "goto(link)" });
      }

      await navigator.goto(action.url);
      stepIndex += 1;
    }
  };

  let runError: unknown;

  if (strategy.name === "random-walk") {
    try {
      await perform();
    } catch (err) {
      runError = err;
      throw err;
    } finally {
      await attachText(testInfo, "explore-seed.txt", String(config.seed));
      await attachText(testInfo, "explore-history.txt", history.join("\n"));
      if (errors.length > 0) {
        await attachText(testInfo, "explore-errors.txt", errors.join("\n"));
      }
      await bench.finish({
        coverage,
        visited,
        targetSet,
        blockedRequests: navigator.blockedExternalRequests,
        status: runError ? "failed" : "passed",
        error: runError,
        history,
      });
    }
    return;
  }

  try {
    await perform();
  } catch (err) {
    runError = err;
    throw err;
  } finally {
    const visitedList = Array.from(visited).sort();
    const targets = Array.from(targetSet ?? new Set<string>()).sort();
    const uncovered = targets.filter((p) => !visited.has(p));
    const coverageRatio =
      targets.length === 0 ? 1 : visitedList.filter((p) => targetSet?.has(p)).length / targets.length;

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
      coverage: coverageRatio,
      visited: visitedList,
      uncovered,
      steps,
      blockedExternalRequests: Array.from(new Set(navigator.blockedExternalRequests)).sort(),
    };

    await writeGuidedCoverage(report, config, testInfo);
    await attachText(testInfo, "guided-seed.txt", String(config.seed));
    await attachText(testInfo, "guided-visited.txt", visitedList.join("\n"));
    await attachText(testInfo, "guided-uncovered.txt", uncovered.join("\n"));
    await bench.finish({
      coverage,
      visited,
      targetSet,
      blockedRequests: navigator.blockedExternalRequests,
      status: runError ? "failed" : "passed",
      error: runError,
      history,
    });
  }
}
