import type { Page, TestInfo } from "@playwright/test";

export type ExploreRng = {
  next: () => number;
  nextInt: (max: number) => number;
};

export type ExploreAction =
  | { action: "goto"; url: string; reason?: string; via?: string; targetPath?: string }
  | { action: "restart"; reason?: string; via?: string }
  | { action: "stop"; reason?: string };

export type ExploreCandidate = {
  href: string;
  abs: string;
  path: string;
};

export type ExploreConfig = {
  seconds: number;
  seed: number;
  startPath: string;
  publish: boolean;
  restartEvery: number;
  flowJsonPath: string;
  strategyName: string;
  artifactsDir: string;
  baseURL: string;
  waitAfterGotoMs: number;
};

export type ExploreContext = {
  page: Page;
  testInfo: TestInfo;
  config: ExploreConfig;
  rng: ExploreRng;
  baseURL: string;
  baseOrigin: string;
  startUrl: string;
  currentUrl: string;
  currentPath: string;
  candidates: ExploreCandidate[];
  visited: Set<string>;
  recent: string[];
  history: string[];
  errors: string[];
  blockedRequests: string[];
  targetSet?: Set<string>;
  stepIndex: number;
};

export type FlowData = {
  meta?: { startPath?: string };
  pages?: string[];
};

export type ExploreInitOptions = {
  config: ExploreConfig;
  loadFlow: () => Promise<FlowData>;
};

export type ExploreInitResult = {
  targetSet?: Set<string>;
  startPath?: string;
};

export type ExploreStrategy = {
  name: string;
  candidateLimit: number;
  dedupeByPath: boolean;
  skipSelf: boolean;
  skipBeforeSlice: boolean;
  init?: (options: ExploreInitOptions) => Promise<ExploreInitResult | void> | ExploreInitResult | void;
  nextAction: (ctx: ExploreContext) => ExploreAction;
};

export function normalizePathFromUrl(urlLike: string): string {
  const url = new URL(urlLike);
  let p = url.pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p;
}
