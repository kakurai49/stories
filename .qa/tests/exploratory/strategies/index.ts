import type { ExploreStrategy } from "../types";
import { guidedCoverageStrategy } from "./guided-coverage";
import { randomWalkStrategy } from "./random-walk";

const strategies: Record<string, ExploreStrategy> = {
  [randomWalkStrategy.name]: randomWalkStrategy,
  [guidedCoverageStrategy.name]: guidedCoverageStrategy,
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
