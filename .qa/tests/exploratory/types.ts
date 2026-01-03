import type { Page, TestInfo } from "@playwright/test";
import type { CoverageState } from "./coverage";

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

export type RewardMode = "coverage" | "bughunt";

export type ExploreConfig = {
  seconds: number;
  seed: number;
  startPath: string;
  allowedPathPrefixes?: string[];
  publish: boolean;
  restartEvery: number;
  flowJsonPath: string;
  strategyName: string;
  artifactsDir: string;
  baseURL: string;
  waitAfterGotoMs: number;
  benchMode: boolean;
  benchRunDir?: string;
  rewardMode: RewardMode;
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
  coverage: CoverageState;
};

export type StepGain = {
  newPages: number;
  newRoutes: number;
  newApis: number;
  newAssets: number;
};

export type StepErrors = {
  httpStatusGE400?: boolean;
  pageerror?: boolean;
  consoleError?: boolean;
};

export type StepFeedback = {
  fromPath: string;
  toPath: string;
  reward: number;
  gain: StepGain;
  errors?: StepErrors;
  revisited: boolean;
  recentLoop: boolean;
  stepIndex: number;
  rewardMode: RewardMode;
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
  onFeedback?: (fb: StepFeedback) => void | Promise<void>;
  onEnd?: () => void | Promise<void>;
};

export function normalizePathFromUrl(urlLike: string): string {
  const url = new URL(urlLike);
  let p = url.pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p;
}
