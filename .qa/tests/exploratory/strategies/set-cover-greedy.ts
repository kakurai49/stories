import type { CoverageItem, CoverageState } from "../coverage";
import type { ExploreCandidate, ExploreContext, ExploreStrategy } from "../types";

export function weightForDf(df: number): number {
  return 1 / (df + 1);
}

export function estimateCoverageForCandidate(candidate: ExploreCandidate, coverage: CoverageState): Set<CoverageItem> {
  const known = coverage.pathToObserved.get(candidate.path);
  if (known) return new Set<CoverageItem>(known);
  return new Set<CoverageItem>([`route:${candidate.path}`]);
}

export function computeGain(items: Set<CoverageItem>, coverage: CoverageState): number {
  let gain = 0;
  for (const item of items) {
    if (coverage.covered.has(item)) continue;
    const df = coverage.df.get(item) ?? 0;
    gain += weightForDf(df);
  }
  return gain;
}

function pickByGain(
  candidates: ExploreCandidate[],
  coverage: CoverageState,
  rng: ExploreContext["rng"]
): { candidate: ExploreCandidate; gain: number; allZero: boolean } {
  let bestGain = Number.NEGATIVE_INFINITY;
  let allZero = true;
  const best: Array<{ candidate: ExploreCandidate; gain: number }> = [];

  for (const candidate of candidates) {
    const items = estimateCoverageForCandidate(candidate, coverage);
    const gain = computeGain(items, coverage);
    if (gain > 0) allZero = false;

    if (gain > bestGain) {
      bestGain = gain;
      best.length = 0;
      best.push({ candidate, gain });
    } else if (gain === bestGain) {
      best.push({ candidate, gain });
    }
  }

  const pick = best[rng.nextInt(best.length)];
  return { ...pick, allZero };
}

export const setCoverGreedyStrategy: ExploreStrategy = {
  name: "set-cover-greedy",
  candidateLimit: 400,
  dedupeByPath: true,
  skipSelf: true,
  skipBeforeSlice: false,
  nextAction: ({ candidates, rng, recent, coverage, config, stepIndex }) => {
    const restartEvery = config.restartEvery;
    if (restartEvery > 0 && stepIndex > 0 && stepIndex % restartEvery === 0) {
      return { action: "restart", reason: "scheduled", via: "goto(restart)" };
    }

    if (candidates.length === 0) {
      return { action: "restart", reason: "dead-end", via: "goto(start)" };
    }

    const avoidRecent = new Set(recent);
    const nonRecent = candidates.filter((c) => !avoidRecent.has(c.path));
    const pool = nonRecent.length > 0 ? nonRecent : candidates;

    const { candidate, gain, allZero } = pickByGain(pool, coverage, rng);
    if (allZero) {
      const fallbackPool = nonRecent.length > 0 ? nonRecent : candidates;
      const fallback = fallbackPool[rng.nextInt(fallbackPool.length)];
      return {
        action: "goto",
        url: fallback.abs,
        targetPath: fallback.path,
        reason: "set-cover-fallback",
        via: "goto(link)",
      };
    }

    return {
      action: "goto",
      url: candidate.abs,
      targetPath: candidate.path,
      reason: `set-cover-gain:${gain.toFixed(4)}`,
      via: "goto(link)",
    };
  },
};
