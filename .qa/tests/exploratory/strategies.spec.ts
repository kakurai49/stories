import { expect, test } from "@playwright/test";
import { createRng } from "./rng";
import { guidedCoverageStrategy } from "./strategies/guided-coverage";
import { randomWalkStrategy } from "./strategies/random-walk";

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
});
