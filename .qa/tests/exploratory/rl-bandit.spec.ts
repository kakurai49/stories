import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createRng } from "./rng";
import { RLBanditLearner } from "./strategies/rl-bandit";
import type { StepFeedback } from "./types";

function baseFeedback(fromPath: string, toPath: string, reward: number): StepFeedback {
  return {
    fromPath,
    toPath,
    reward,
    gain: { newPages: 0, newRoutes: 0, newApis: 0, newAssets: 0 },
    revisited: false,
    recentLoop: false,
    stepIndex: 0,
    rewardMode: "coverage",
  };
}

function createOptions(modelPath: string, persist: boolean, reset = false) {
  return {
    algo: "ucb1" as const,
    eps: 0.1,
    ucbC: 1.2,
    persist,
    modelPath,
    reset,
    maxArmsPerState: 500,
    persistEvery: 1,
    rewardMode: "coverage" as const,
  };
}

test("rl-bandit prefers untried arms then UCB1 score", async () => {
  const learner = new RLBanditLearner(createOptions("noop.json", false));
  await learner.init();

  await learner.onFeedback({ ...baseFeedback("/from", "/a", 1), gain: { newPages: 1, newRoutes: 0, newApis: 0, newAssets: 0 } });
  await learner.onFeedback({ ...baseFeedback("/from", "/a", 1), gain: { newPages: 1, newRoutes: 0, newApis: 0, newAssets: 0 } });
  await learner.onFeedback(baseFeedback("/from", "/b", 3));
  await learner.onFeedback(baseFeedback("/from", "/b", 2));

  const candidates = [
    { href: "/a", abs: "http://example.com/a", path: "/a" },
    { href: "/b", abs: "http://example.com/b", path: "/b" },
    { href: "/c", abs: "http://example.com/c", path: "/c" },
  ];

  const pickUntried = learner.select("/from", candidates, createRng(7));
  expect(pickUntried.path).toBe("/c");

  // make /c tried once to test UCB scores
  await learner.onFeedback(baseFeedback("/from", "/c", 0.5));
  const pickByScore = learner.select("/from", candidates, createRng(11));
  expect(pickByScore.path).toBe("/b");
});

test("rl-bandit updates incremental mean and count", async () => {
  const learner = new RLBanditLearner(createOptions("noop.json", false));
  await learner.init();

  await learner.onFeedback(baseFeedback("/state", "/next", 1));
  await learner.onFeedback(baseFeedback("/state", "/next", 3));

  const table = (learner as any).model.table as Record<string, Record<string, { n: number; mean: number }>>;
  expect(table["/state"]["/next"].n).toBe(2);
  expect(table["/state"]["/next"].mean).toBeCloseTo(2);
});

test("rl-bandit saves and loads model", async ({}, testInfo) => {
  const modelPath = path.join(testInfo.outputPath(), "bandit-model.json");
  const learner = new RLBanditLearner(createOptions(modelPath, true));
  await learner.init();
  await learner.onFeedback(baseFeedback("/s", "/t", 4));
  await learner.onEnd();

  const raw = await fs.readFile(modelPath, "utf8");
  expect(raw).toContain("/t");

  const loaded = new RLBanditLearner(createOptions(modelPath, true));
  await loaded.init();
  const table = (loaded as any).model.table as Record<string, Record<string, { n: number; mean: number }>>;
  expect(table["/s"]["/t"].n).toBe(1);
  expect(table["/s"]["/t"].mean).toBeCloseTo(4);
});

test("rl-bandit tolerates broken JSON on load", async ({}, testInfo) => {
  const modelPath = path.join(testInfo.outputPath(), "broken-model.json");
  await fs.writeFile(modelPath, "{not-json", "utf8");

  const learner = new RLBanditLearner(createOptions(modelPath, true));
  await expect(learner.init()).resolves.not.toThrow();

  const table = (learner as any).model.table as Record<string, unknown>;
  expect(Object.keys(table)).toHaveLength(0);
});
