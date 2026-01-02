import path from "node:path";
import { qa } from "../../qa.config";
import type { ExploreConfig } from "./types";

function parseNumber(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function parseAllowedPrefixes(input: string | undefined, fallback?: string[]): string[] | undefined {
  if (!input) return fallback;
  const prefixes = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const withSlash = p.startsWith("/") ? p : `/${p}`;
      return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.replace(/\/+$/, "") : withSlash;
    });
  return prefixes.length > 0 ? prefixes : fallback;
}

export function loadExploreConfig(defaults?: Partial<ExploreConfig> & { defaultStrategy?: string }): ExploreConfig {
  const seconds = parseNumber(process.env.QA_EXPLORE_SECONDS, defaults?.seconds ?? 120);
  const seed = parseNumber(process.env.QA_EXPLORE_SEED, defaults?.seed ?? Date.now());
  const publish = (process.env.QA_EXPLORE_PUBLISH ?? "0") === "1";
  const restartEvery = parseNumber(process.env.QA_EXPLORE_RESTART_EVERY, defaults?.restartEvery ?? 15);
  const strategyName = (process.env.QA_EXPLORE_STRATEGY ?? defaults?.defaultStrategy ?? "random-walk").trim();
  const flowJsonPath =
    process.env.QA_FLOW_JSON ?? defaults?.flowJsonPath ?? path.join(qa.artifactsDir, "flow", "screen-flow.json");

  const startPath =
    process.env.QA_EXPLORE_START_PATH ??
    defaults?.startPath ??
    (qa.routes?.[0] ?? "/");
  const allowedPathPrefixes = parseAllowedPrefixes(process.env.QA_EXPLORE_ALLOWED_PATH_PREFIXES, defaults?.allowedPathPrefixes);

  const artifactsDir =
    process.env.QA_EXPLORE_OUTPUT_DIR ??
    defaults?.artifactsDir ??
    path.join(qa.artifactsDir, "explore");

  const benchRunDirEnv = process.env.QA_EXPLORE_BENCH_RUN_DIR;
  const benchMode = (process.env.QA_EXPLORE_BENCH ?? "0") === "1" || Boolean(benchRunDirEnv);
  const benchRunDir = benchRunDirEnv || (benchMode ? artifactsDir : undefined);

  return {
    seconds,
    seed,
    startPath,
    allowedPathPrefixes,
    publish,
    restartEvery,
    flowJsonPath,
    strategyName,
    artifactsDir,
    benchMode,
    benchRunDir,
    baseURL: defaults?.baseURL ?? qa.baseURL,
    waitAfterGotoMs: defaults?.waitAfterGotoMs ?? qa.waitAfterGotoMs,
  };
}
