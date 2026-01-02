import type { ExploreStrategy } from "../types";

export const randomWalkStrategy: ExploreStrategy = {
  name: "random-walk",
  candidateLimit: 200,
  dedupeByPath: false,
  skipSelf: false,
  skipBeforeSlice: true,
  nextAction: ({ candidates, rng }) => {
    if (candidates.length === 0) {
      return { action: "restart", reason: "dead-end", via: "goto(start)" };
    }

    const pick = candidates[rng.nextInt(candidates.length)];
    return { action: "goto", url: pick.abs, reason: "random-pick", targetPath: pick.path, via: "goto(link)" };
  },
};
