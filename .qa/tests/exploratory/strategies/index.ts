import type { ExploreStrategy } from "../types";
import { guidedCoverageStrategy } from "./guided-coverage";
import { randomWalkStrategy } from "./random-walk";
import { setCoverGreedyStrategy } from "./set-cover-greedy";

const strategies: Record<string, ExploreStrategy> = {
  [randomWalkStrategy.name]: randomWalkStrategy,
  [guidedCoverageStrategy.name]: guidedCoverageStrategy,
  [setCoverGreedyStrategy.name]: setCoverGreedyStrategy,
  ["set-cover"]: setCoverGreedyStrategy,
};

export function getStrategy(name: string): ExploreStrategy {
  const strategy = strategies[name];
  if (!strategy) {
    const keys = Object.keys(strategies).sort();
    throw new Error(`Unknown QA_EXPLORE_STRATEGY=${name}. Available: ${keys.join(", ")}`);
  }
  return strategy;
}

export const availableStrategies = Object.keys(strategies).sort();
