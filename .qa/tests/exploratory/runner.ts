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
  RewardMode,
  StepErrors,
  StepFeedback,
} from "./types";
import { normalizePathFromUrl } from "./types";
import { createBenchmarkRecorder } from "./bench-logger";
import { getBanditSnapshot } from "./strategies/rl-bandit";

export type RunExploreOptions = {
  page: Page;
  testInfo: TestInfo;
  strategy: ExploreStrategy;
  config: ExploreConfig;
};

type Navigator = {
  goto: (url: string) => Promise<NavigationResult>;
  errors: string[];
  blockedExternalRequests: string[];
  getLastErrors: () => NavigationErrorFlags;
};

type NavigationErrorFlags = { httpStatusGE400: boolean; pageerror: boolean; consoleError: boolean };
type NavigationResult = { errors: NavigationErrorFlags };

type CoverageSnapshot = {
  pagesVisited: number;
  routesVisited: number;
  apisVisited: number;
  assetsVisited: number;
};

type PendingFeedback = {
  fromPath: string;
  toPath: string;
  before: CoverageSnapshot;
  revisited: boolean;
  recentLoop: boolean;
  stepIndex: number;
  errors?: NavigationErrorFlags;
};

function rememberRecent(recent: string[], path: string) {
  recent.push(path);
  if (recent.length > 5) recent.shift();
}

function snapshotCoverage(coverage: ReturnType<typeof createCoverageState>): CoverageSnapshot {
  let routesVisited = 0;
  let apisVisited = 0;
  let assetsVisited = 0;

  for (const item of coverage.covered) {
    if (item.startsWith("route:")) routesVisited += 1;
    else if (item.startsWith("api:")) apisVisited += 1;
    else if (item.startsWith("asset:")) assetsVisited += 1;
  }

  return {
    pagesVisited: coverage.pathToObserved.size,
    routesVisited,
    apisVisited,
    assetsVisited,
  };
}

function diffCoverage(before: CoverageSnapshot, after: CoverageSnapshot) {
  return {
    newPages: Math.max(0, after.pagesVisited - before.pagesVisited),
    newRoutes: Math.max(0, after.routesVisited - before.routesVisited),
    newApis: Math.max(0, after.apisVisited - before.apisVisited),
    newAssets: Math.max(0, after.assetsVisited - before.assetsVisited),
  };
}

function computeReward(
  gain: ReturnType<typeof diffCoverage>,
  rewardMode: RewardMode,
  revisited: boolean,
  recentLoop: boolean,
  foundError: boolean
): number {
  const base =
    2 * gain.newPages + 1 * gain.newRoutes + 0.5 * gain.newApis + 0.2 * gain.newAssets - 0.3 * (revisited ? 1 : 0) -
    0.6 * (recentLoop ? 1 : 0);

  const errorTerm = rewardMode === "bughunt" ? 5 * (foundError ? 1 : 0) : -3 * (foundError ? 1 : 0);
  return base + errorTerm;
}

function hasError(errors?: StepErrors): boolean {
  return Boolean(errors?.httpStatusGE400 || errors?.consoleError || errors?.pageerror);
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
  const freshErrorFlags = (): NavigationErrorFlags => ({ httpStatusGE400: false, pageerror: false, consoleError: false });
  let lastErrors = freshErrorFlags();

  const markErrorsFromMessages = (messages: string[]) => {
    for (const msg of messages) {
      if (msg.startsWith("console:")) lastErrors.consoleError = true;
      if (msg.startsWith("pageerror:")) lastErrors.pageerror = true;
    }
  };

  if (mode === "random") {
    page.on("pageerror", (e) => {
      const msg = `pageerror: ${String(e)}`;
      errors.push(msg);
      lastErrors.pageerror = true;
      recordBenchError?.({ type: "pageerror", message: msg });
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;

      const text = msg.text();
      const isBlockedErr = text.includes("Failed to load resource: net::ERR_FAILED");
      if (isBlockedErr && blockedFromTestInfo.length > 0) return;

      errors.push(`console: ${text}`);
      lastErrors.consoleError = true;
      recordBenchError?.({ type: "console", message: text });
    });

    return {
      goto: async (url: string) => {
        lastErrors = freshErrorFlags();
        resetCoverage();
        const previousErrors = errors.length;
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(waitAfterGotoMs);

        history.push(url);

        const status = resp?.status?.();
        if (typeof status === "number" && status >= 400) {
          lastErrors.httpStatusGE400 = true;
          recordBenchError?.({ type: "http", message: `HTTP ${status} at ${url}`, url, status });
          throw new Error(`HTTP ${status} at ${url}`);
        }

        if (errors.length > previousErrors) markErrorsFromMessages(errors.slice(previousErrors));

        if (errors.length > 0) {
          if (errors.length > previousErrors) markErrorsFromMessages(errors.slice(previousErrors));
          if (errors.length === previousErrors) markErrorsFromMessages(errors);
          recordBenchError?.({ type: "navigation", message: errors.join(" | "), url });
          throw new Error(`Console/Page error at ${url}: ${errors.join(" | ")}`);
        }

        return { errors: { ...lastErrors } };
      },
      errors,
      blockedExternalRequests,
      getLastErrors: () => ({ ...lastErrors }),
    };
  }

  page.on("pageerror", (e) => {
    const msg = `pageerror: ${String(e)}`;
    errors.push(msg);
    lastErrors.pageerror = true;
    recordBenchError?.({ type: "pageerror", message: msg });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      errors.push(`console: ${text}`);
      lastErrors.consoleError = true;
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
      lastErrors = freshErrorFlags();
      resetCoverage();
      errors.length = 0;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(waitAfterGotoMs);

      const status = resp?.status?.();
      if (typeof status === "number" && status >= 400) {
        lastErrors.httpStatusGE400 = true;
        recordBenchError?.({ type: "http", message: `HTTP ${status} at ${url}`, url, status });
        throw new Error(`HTTP ${status} at ${url}`);
      }

      if (errors.length > 0) {
        const nonNoise = errors.filter((e) => !/Failed to load resource/i.test(e));
        if (nonNoise.length > 0) {
          markErrorsFromMessages(nonNoise);
          recordBenchError?.({ type: "navigation", message: nonNoise.join(" | "), url });
          throw new Error(`Console/Page error at ${url}: ${nonNoise.join(" | ")}`);
        }
        errors.length = 0;
      }

      return { errors: { ...lastErrors } };
    },
    errors,
    blockedExternalRequests,
    getLastErrors: () => ({ ...lastErrors }),
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

  const defaultErrors: NavigationErrorFlags = { httpStatusGE400: false, pageerror: false, consoleError: false };
  let pendingFeedback: PendingFeedback | null = null;
  let lastProcessedPath: string | null = null;

  const emitFeedback = async (pending: PendingFeedback, afterSnapshot: CoverageSnapshot, errorsForStep?: NavigationErrorFlags) => {
    const gain = diffCoverage(pending.before, afterSnapshot);
    const errorsInfo: StepErrors | undefined = errorsForStep ?? pending.errors;
    const foundError = hasError(errorsInfo);
    const reward = computeReward(gain, config.rewardMode, pending.revisited, pending.recentLoop, foundError);
    const feedback: StepFeedback = {
      fromPath: pending.fromPath,
      toPath: pending.toPath,
      reward,
      gain,
      errors: errorsInfo,
      revisited: pending.revisited,
      recentLoop: pending.recentLoop,
      stepIndex: pending.stepIndex,
      rewardMode: config.rewardMode,
    };
    bench.recordFeedback(feedback);
    await strategy.onFeedback?.(feedback);
  };

  const processCurrentPage = () => {
    const currentUrl = page.url();
    const currentPath = normalizePathFromUrl(currentUrl);
    const alreadyProcessed = lastProcessedPath === currentPath && observedSinceLastGoto.size === 0;
    if (!alreadyProcessed) {
      const observedForPage = new Set<string>(observedSinceLastGoto);
      observedForPage.add(`route:${currentPath}`);
      updateCoverage(coverage, currentPath, observedForPage);
      observedSinceLastGoto.clear();
      lastProcessedPath = currentPath;
      bench.recordVisit(currentPath);
      visited.add(currentPath);
      rememberRecent(recent, currentPath);
    }

    return { currentUrl, currentPath, afterSnapshot: snapshotCoverage(coverage) };
  };

  const perform = async () => {
    await navigator.goto(startUrl);

    while (Date.now() < deadline) {
      const { currentUrl, currentPath, afterSnapshot } = processCurrentPage();
      if (pendingFeedback) {
        await emitFeedback(pendingFeedback, afterSnapshot, pendingFeedback.errors);
        pendingFeedback = null;
      }

      const candidates = await collectCandidates({
        page,
        baseOrigin,
        currentUrl,
        currentPath,
        limit: strategy.candidateLimit,
        dedupeByPath: strategy.dedupeByPath,
        skipSelf: strategy.skipSelf,
        skipBeforeSlice: strategy.skipBeforeSlice,
        allowedPathPrefixes: config.allowedPathPrefixes,
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
      bench.recordStep({ stepIndex, from: currentPath, action, candidates, coverage, visited, recent });
      if (action.action === "stop") break;

      const beforeSnapshot = snapshotCoverage(coverage);

      if (action.action === "restart") {
        if (strategy.name !== "random-walk") {
          steps.push({ from: currentPath, to: startPathNormalized, via: action.via ?? "goto(start)" });
        }
        pendingFeedback = {
          fromPath: currentPath,
          toPath: startPathNormalized,
          before: beforeSnapshot,
          revisited: visited.has(startPathNormalized),
          recentLoop: recent.includes(startPathNormalized),
          stepIndex,
          errors: defaultErrors,
        };
        try {
          const result = await navigator.goto(startUrl);
          pendingFeedback.errors = result.errors;
        } catch (err) {
          pendingFeedback.errors = navigator.getLastErrors();
          await emitFeedback(pendingFeedback, snapshotCoverage(coverage), pendingFeedback.errors);
          pendingFeedback = null;
          throw err;
        }
        stepIndex += 1;
        continue;
      }

      if (strategy.name !== "random-walk") {
        const toPath = action.targetPath ?? normalizePathFromUrl(action.url);
        steps.push({ from: currentPath, to: toPath, via: action.via ?? "goto(link)" });
      }

      const toPath = action.targetPath ?? normalizePathFromUrl(action.url);
      pendingFeedback = {
        fromPath: currentPath,
        toPath,
        before: beforeSnapshot,
        revisited: visited.has(toPath),
        recentLoop: recent.includes(toPath),
        stepIndex,
        errors: defaultErrors,
      };

      try {
        const navResult = await navigator.goto(action.url);
        pendingFeedback.errors = navResult.errors;
      } catch (err) {
        pendingFeedback.errors = navigator.getLastErrors();
        await emitFeedback(pendingFeedback, snapshotCoverage(coverage), pendingFeedback.errors);
        pendingFeedback = null;
        throw err;
      }

      stepIndex += 1;
    }

    if (pendingFeedback) {
      const { afterSnapshot } = processCurrentPage();
      await emitFeedback(pendingFeedback, afterSnapshot, pendingFeedback.errors);
      pendingFeedback = null;
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
      try {
        await attachText(testInfo, "explore-seed.txt", String(config.seed));
        await attachText(testInfo, "explore-history.txt", history.join("\n"));
        if (errors.length > 0) {
          await attachText(testInfo, "explore-errors.txt", errors.join("\n"));
        }
        const strategyState = strategy.name === "rl-bandit" ? getBanditSnapshot() : undefined;
        await bench.finish({
          coverage,
          visited,
          targetSet,
          blockedRequests: navigator.blockedExternalRequests,
          status: runError ? "failed" : "passed",
          error: runError,
          history,
          strategyState: strategyState ? { name: strategy.name, data: strategyState } : undefined,
        });
      } finally {
        await strategy.onEnd?.();
      }
    }
    return;
  }

  try {
    await perform();
  } catch (err) {
    runError = err;
    throw err;
  } finally {
    try {
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
      const strategyState = strategy.name === "rl-bandit" ? getBanditSnapshot() : undefined;
      await bench.finish({
        coverage,
        visited,
        targetSet,
        blockedRequests: navigator.blockedExternalRequests,
        status: runError ? "failed" : "passed",
        error: runError,
        history,
        strategyState: strategyState ? { name: strategy.name, data: strategyState } : undefined,
      });
    } finally {
      await strategy.onEnd?.();
    }
  }
}
