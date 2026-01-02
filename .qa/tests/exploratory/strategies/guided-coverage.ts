import type { ExploreStrategy } from "../types";

function normalizeFlowTargets(pages: string[] = []): Set<string> {
  return new Set<string>(pages.map((p) => (p === "/" ? "/" : p.replace(/\/+$/, ""))));
}

export const guidedCoverageStrategy: ExploreStrategy = {
  name: "guided-coverage",
  candidateLimit: 400,
  dedupeByPath: true,
  skipSelf: true,
  skipBeforeSlice: false,
  init: async ({ config, loadFlow }) => {
    const flow = await loadFlow();
    const targetSet = normalizeFlowTargets(flow.pages ?? []);
    const startPath = process.env.QA_EXPLORE_START_PATH ?? flow?.meta?.startPath ?? "/";
    return { targetSet, startPath };
  },
  nextAction: ({ candidates, rng, targetSet, visited, recent, config, stepIndex }) => {
    const restartEvery = config.restartEvery;
    if (restartEvery > 0 && stepIndex > 0 && stepIndex % restartEvery === 0) {
      return { action: "restart", reason: "scheduled", via: "goto(restart)" };
    }

    if (candidates.length === 0) {
      return { action: "restart", reason: "dead-end", via: "goto(start)" };
    }

    const targets = targetSet ?? new Set<string>();
    const unvisitedTargets = candidates.filter((c) => targets.has(c.path) && !visited.has(c.path));
    const unvisitedAny = candidates.filter((c) => !visited.has(c.path));

    const pool = unvisitedTargets.length > 0 ? unvisitedTargets : unvisitedAny.length > 0 ? unvisitedAny : candidates;
    const avoid = new Set(recent);
    const filteredPool = pool.filter((c) => !avoid.has(c.path));
    const finalPool = filteredPool.length > 0 ? filteredPool : pool;

    const pick = finalPool[rng.nextInt(finalPool.length)];
    return { action: "goto", url: pick.abs, reason: "guided-pick", targetPath: pick.path, via: "goto(link)" };
  },
};
