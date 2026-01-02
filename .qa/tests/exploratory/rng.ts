import type { ExploreRng } from "./types";

export function createRng(seed: number): ExploreRng {
  let x = seed >>> 0;

  const next = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };

  return {
    next,
    nextInt: (max: number) => {
      if (max <= 0) return 0;
      return Math.floor(next() * max);
    },
  };
}
