import { expect, test } from "@playwright/test";
import { createCoverageState, updateCoverage } from "./coverage";
import { createRng } from "./rng";
import { guidedCoverageStrategy } from "./strategies/guided-coverage";
import { randomWalkStrategy } from "./strategies/random-walk";
import {
  computeGain,
  setCoverGreedyStrategy,
  weightForDf,
} from "./strategies/set-cover-greedy";

test.describe("explore strategies", () => {
  test("random-walk restarts on dead end", () => {
    const action = randomWalkStrategy.nextAction({ candidates: [], rng: createRng(1) } as any);
    expect(action).toEqual(expect.objectContaining({ action: "restart", via: "goto(start)" }));
  });

  test("random-walk picks a candidate using rng", () => {
    const action = randomWalkStrategy.nextAction({
      candidates: [
        { href: "/a", abs: "http://example.com/a", path: "/a" },
        { href: "/b", abs: "http://example.com/b", path: "/b" },
      ],
      rng: { next: () => 0, nextInt: () => 1 },
    } as any);

    expect(action).toEqual(
      expect.objectContaining({ action: "goto", url: "http://example.com/b", targetPath: "/b", via: "goto(link)" })
    );
  });

  test("guided-coverage restarts on schedule", () => {
    const action = guidedCoverageStrategy.nextAction({
      candidates: [{ href: "/a", abs: "http://example.com/a", path: "/a" }],
      rng: createRng(1),
      targetSet: new Set<string>(),
      visited: new Set<string>(),
      recent: [],
      config: { restartEvery: 2 } as any,
      stepIndex: 2,
    } as any);

    expect(action).toEqual(expect.objectContaining({ action: "restart", via: "goto(restart)" }));
  });

  test("guided-coverage prefers targetSet then unvisited", () => {
    const action = guidedCoverageStrategy.nextAction({
      candidates: [
        { href: "/a", abs: "http://example.com/a", path: "/a" },
        { href: "/c", abs: "http://example.com/c", path: "/c" },
      ],
      rng: createRng(7),
      targetSet: new Set<string>(["/c"]),
      visited: new Set<string>(),
      recent: [],
      config: { restartEvery: 15 } as any,
      stepIndex: 1,
    } as any);

    expect(action).toEqual(expect.objectContaining({ action: "goto", url: "http://example.com/c", targetPath: "/c" }));
  });

  test("guided-coverage avoids recent paths when possible", () => {
    const action = guidedCoverageStrategy.nextAction({
      candidates: [
        { href: "/a", abs: "http://example.com/a", path: "/a" },
        { href: "/b", abs: "http://example.com/b", path: "/b" },
      ],
      rng: createRng(5),
      targetSet: new Set<string>(),
      visited: new Set<string>(),
      recent: ["/a"],
      config: { restartEvery: 15 } as any,
      stepIndex: 0,
    } as any);

    expect(action).toEqual(expect.objectContaining({ targetPath: "/b" }));
  });

  test("set-cover gain decreases as df increases and ignores covered items", () => {
    expect(weightForDf(0)).toBeGreaterThan(weightForDf(2));

    const coverage = createCoverageState();
    coverage.covered.add("route:/known");
    coverage.df.set("route:/known", 3);

    const gain = computeGain(new Set(["route:/known", "asset:/bundle.js"]), coverage);
    expect(gain).toBeCloseTo(weightForDf(0));
  });

  test("set-cover-greedy prefers candidates with more uncovered coverage", () => {
    const coverage = createCoverageState();
    updateCoverage(coverage, "/a", new Set(["route:/a", "asset:/shared.js"]));
    updateCoverage(coverage, "/b", new Set(["route:/b", "api:GET /api/data"]));
    coverage.pathToObserved.set("/rich", new Set(["route:/rich", "asset:/unique.js", "asset:/shared.js"]));

    const action = setCoverGreedyStrategy.nextAction({
      candidates: [
        { href: "/a", abs: "http://example.com/a", path: "/a" },
        { href: "/rich", abs: "http://example.com/rich", path: "/rich" },
      ],
      rng: createRng(10),
      recent: [],
      coverage,
      config: { restartEvery: 15 } as any,
      stepIndex: 1,
    } as any);

    expect(action).toEqual(expect.objectContaining({ targetPath: "/rich" }));
  });

  test("set-cover-greedy avoids recent when possible and falls back on zero gain", () => {
    const coverage = createCoverageState();
    coverage.covered.add("route:/old");
    coverage.covered.add("route:/older");
    coverage.df.set("route:/old", 2);
    coverage.df.set("route:/older", 2);
    coverage.pathToObserved.set("/old", new Set(["route:/old"]));
    coverage.pathToObserved.set("/older", new Set(["route:/older"]));

    const action = setCoverGreedyStrategy.nextAction({
      candidates: [
        { href: "/old", abs: "http://example.com/old", path: "/old" },
        { href: "/older", abs: "http://example.com/older", path: "/older" },
      ],
      rng: createRng(1),
      recent: ["/older"],
      coverage,
      config: { restartEvery: 15 } as any,
      stepIndex: 0,
    } as any);

    expect(action).toEqual(expect.objectContaining({ targetPath: "/old", reason: "set-cover-fallback" }));
  });
});
