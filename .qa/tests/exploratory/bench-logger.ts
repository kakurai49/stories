import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import type { CoverageState } from "./coverage";
import type { ExploreAction, ExploreCandidate, ExploreConfig } from "./types";

type BenchErrorType = "http" | "console" | "pageerror" | "navigation" | "other";
type RequestKind = "api" | "asset" | "route" | "other";

type BenchError = {
  type: BenchErrorType;
  message: string;
  url?: string;
  status?: number;
  at: string;
};

type BenchStep = {
  stepIndex: number;
  action: ExploreAction["action"];
  from: string;
  to?: string;
  reason?: string;
  via?: string;
  candidates: number;
  restart: boolean;
  coverageCount: number;
  uniqueRoutes: number;
};

type RequestKey = `${RequestKind}:${string}:${string}`;

function noOpRecorder(): BenchmarkRecorder {
  return {
    enabled: false,
    recordVisit() {},
    recordStep() {},
    recordError() {},
    recordRequest() {},
    async finish() {},
  };
}

function gitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function ensureDir(p: string) {
  return fs.mkdir(p, { recursive: true });
}

function safeWriteFile(filePath: string, body: string) {
  return fs.writeFile(filePath, body, "utf8");
}

function countPrefix(set: Set<string>, prefix: string): number {
  let count = 0;
  for (const item of set) {
    if (item.startsWith(prefix)) count += 1;
  }
  return count;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export type BenchmarkRecorder = {
  enabled: boolean;
  recordVisit: (path: string) => void;
  recordStep: (params: {
    stepIndex: number;
    from: string;
    action: ExploreAction;
    candidates: ExploreCandidate[];
    coverage: CoverageState;
    visited: Set<string>;
  }) => void;
  recordError: (error: BenchError) => void;
  recordRequest: (path: string, kind: RequestKind, method?: string) => void;
  finish: (params: {
    coverage: CoverageState;
    visited: Set<string>;
    targetSet?: Set<string>;
    blockedRequests: string[];
    status: "passed" | "failed";
    error?: unknown;
    history: string[];
  }) => Promise<void>;
};

export function createBenchmarkRecorder(options: {
  config: ExploreConfig;
  strategyName: string;
}): BenchmarkRecorder {
  const { config, strategyName } = options;
  if (!config.benchMode) return noOpRecorder();

  const runDir = config.benchRunDir ?? config.artifactsDir;
  const startedAt = Date.now();
  const visits: string[] = [];
  const errors: BenchError[] = [];
  const steps: BenchStep[] = [];
  const requests = new Map<RequestKey, number>();
  const commit = gitCommit();

  return {
    enabled: true,
    recordVisit: (path) => {
      visits.push(path);
    },
    recordStep: ({ stepIndex, from, action, candidates, coverage, visited }) => {
      const to = action.action === "goto" ? action.targetPath ?? action.url : undefined;
      steps.push({
        stepIndex,
        action: action.action,
        from,
        to,
        reason: action.reason,
        via: action.via,
        candidates: candidates.length,
        restart: action.action === "restart",
        coverageCount: coverage.covered.size,
        uniqueRoutes: visited.size,
      });
    },
    recordError: (error) => {
      errors.push(error);
    },
    recordRequest: (path, kind, method) => {
      const key: RequestKey = `${kind}:${path}:${method ?? ""}`;
      requests.set(key, (requests.get(key) ?? 0) + 1);
    },
    async finish({ coverage, visited, targetSet, blockedRequests, status, error, history }) {
      try {
        await ensureDir(runDir);
        const endedAt = Date.now();
        const uniqueRoutes = visited.size;
        const revisitRate = visits.length === 0 ? 0 : 1 - uniqueRoutes / visits.length;

        const flowTargetsTotal = targetSet ? targetSet.size : undefined;
        const flowTargetsHit =
          targetSet && targetSet.size > 0 ? visits.filter((p) => targetSet.has(p)).length : undefined;
        const coverageRate =
          flowTargetsHit !== undefined && flowTargetsTotal && flowTargetsTotal > 0
            ? flowTargetsHit / flowTargetsTotal
            : undefined;

        const errorCounts = {
          http: errors.filter((e) => e.type === "http").length,
          console: errors.filter((e) => e.type === "console").length,
          pageerror: errors.filter((e) => e.type === "pageerror").length,
        };

        const requestEntries = Array.from(requests.entries()).map(([key, count]) => {
          const [kind, reqPath, method] = key.split(":");
          return { kind, path: reqPath, method, count };
        });
        const requestTotals = requestEntries.reduce((acc, curr) => acc + curr.count, 0);
        const topRequests = requestEntries.sort((a, b) => b.count - a.count).slice(0, 50);

        const apiCount = countPrefix(coverage.covered, "api:");
        const assetCount = countPrefix(coverage.covered, "asset:");

        const runJson = {
          meta: {
            strategy: strategyName,
            seed: config.seed,
            seconds: config.seconds,
            startPath: config.startPath,
            restartEvery: config.restartEvery,
            baseURL: config.baseURL,
            flowJsonPath: config.flowJsonPath,
            publish: config.publish,
            runDir,
            runStartedAt: new Date(startedAt).toISOString(),
            runEndedAt: new Date(endedAt).toISOString(),
            durationSeconds: Math.round((endedAt - startedAt) / 10) / 100,
            status,
            errorMessage: error ? String(error) : undefined,
            blockedExternalRequests: Array.from(new Set(blockedRequests)).sort(),
            commitHash: commit,
            historyCount: history.length,
          },
          metrics: {
            steps: steps.length,
            uniqueRoutes,
            revisitRate,
            errorsTotal: errors.length,
            httpErrors: errorCounts.http,
            consoleErrors: errorCounts.console,
            pageErrors: errorCounts.pageerror,
            restarts: steps.filter((s) => s.restart).length,
            flowTargetsHit,
            flowTargetsTotal,
            coverageRate,
            uniqueApis: apiCount,
            uniqueAssets: assetCount,
            requestsTotal: requestTotals,
            medianCandidates: median(steps.map((s) => s.candidates)),
          },
          files: {
            visited: "visited.txt",
            visitedJson: "visited.json",
            errors: "errors.jsonl",
            steps: "steps.jsonl",
            requestsTop: "requests-top.json",
          },
        };

        await ensureDir(runDir);
        await Promise.all([
          safeWriteFile(path.join(runDir, "visited.txt"), visits.join("\n")),
          safeWriteFile(path.join(runDir, "visited.json"), JSON.stringify(visits, null, 2)),
          safeWriteFile(
            path.join(runDir, "errors.jsonl"),
            errors.map((e) => JSON.stringify(e)).join("\n")
          ),
          safeWriteFile(path.join(runDir, "steps.jsonl"), steps.map((s) => JSON.stringify(s)).join("\n")),
          safeWriteFile(path.join(runDir, "requests-top.json"), JSON.stringify(topRequests, null, 2)),
          safeWriteFile(path.join(runDir, "run.json"), JSON.stringify(runJson, null, 2)),
        ]);
      } catch (err) {
        console.warn("[explore-bench] Failed to write benchmark artifacts", err);
      }
    },
  };
}
