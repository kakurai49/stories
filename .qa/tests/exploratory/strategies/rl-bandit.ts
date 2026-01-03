import fs from "node:fs/promises";
import path from "node:path";
import type { ExploreCandidate, ExploreContext, ExploreStrategy, RewardMode, StepFeedback } from "../types";

type ArmStats = { n: number; mean: number };
type ArmTable = Record<string, ArmStats>;

type BanditModel = {
  version: 1;
  algo: "ucb1" | "eps-greedy";
  params: { eps: number; ucbC: number; rewardMode: RewardMode };
  table: Record<string, ArmTable>;
  createdAt: string;
  updatedAt: string;
};

export type RLBanditOptions = {
  algo: "ucb1" | "eps-greedy";
  eps: number;
  ucbC: number;
  persist: boolean;
  modelPath: string;
  reset: boolean;
  maxArmsPerState: number;
  persistEvery: number;
  rewardMode: RewardMode;
};

export type RLBanditSnapshot = {
  algo: BanditModel["algo"];
  params: BanditModel["params"];
  createdAt: string;
  updatedAt: string;
  summary: {
    states: number;
    totalArms: number;
    totalPulls: number;
    maxArmsPerState: number;
  };
  states: Array<{
    state: string;
    arms: number;
    totalPulls: number;
    bestArm?: { path: string; mean: number; pulls: number };
  }>;
  table: BanditModel["table"];
};

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAlgo(value: string | undefined): "ucb1" | "eps-greedy" {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "eps-greedy" ? "eps-greedy" : "ucb1";
}

export class RLBanditLearner {
  private model: BanditModel;
  private readonly options: RLBanditOptions;
  private feedbackSincePersist = 0;

  constructor(options: RLBanditOptions) {
    const now = new Date().toISOString();
    this.options = options;
    this.model = {
      version: 1,
      algo: options.algo,
      params: { eps: options.eps, ucbC: options.ucbC, rewardMode: options.rewardMode },
      table: {},
      createdAt: now,
      updatedAt: now,
    };
  }

  async init(): Promise<void> {
    if (!this.options.persist || this.options.reset) return;

    try {
      const raw = await fs.readFile(this.options.modelPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<BanditModel>;
      if (parsed?.version !== 1 || !parsed.table) return;
      this.model = {
        version: 1,
        algo: parseAlgo(parsed.algo),
        params: {
          eps: typeof parsed.params?.eps === "number" ? parsed.params.eps : this.options.eps,
          ucbC: typeof parsed.params?.ucbC === "number" ? parsed.params.ucbC : this.options.ucbC,
          rewardMode: (parsed.params?.rewardMode as RewardMode) ?? this.options.rewardMode,
        },
        table: parsed.table,
        createdAt: parsed.createdAt ?? this.model.createdAt,
        updatedAt: parsed.updatedAt ?? this.model.updatedAt,
      };
    } catch {
      // fallback to fresh model
      this.model.table = {};
    }
  }

  private armStats(fromPath: string, toPath: string): ArmStats {
    const state = this.model.table[fromPath] ?? {};
    return state[toPath] ?? { n: 0, mean: 0 };
  }

  private ensureState(fromPath: string): ArmTable {
    if (!this.model.table[fromPath]) {
      this.model.table[fromPath] = {};
    }
    return this.model.table[fromPath];
  }

  private pruneState(fromPath: string) {
    const state = this.model.table[fromPath];
    if (!state) return;
    const entries = Object.entries(state);
    if (entries.length <= this.options.maxArmsPerState) return;

    entries.sort((a, b) => {
      const nDiff = a[1].n - b[1].n;
      if (nDiff !== 0) return nDiff;
      return a[1].mean - b[1].mean;
    });

    const removeCount = entries.length - this.options.maxArmsPerState;
    for (let i = 0; i < removeCount; i += 1) {
      const [toPath] = entries[i];
      delete state[toPath];
    }
  }

  private pickByUcb(fromPath: string, candidates: ExploreCandidate[], rng: ExploreContext["rng"]): ExploreCandidate {
    const stats = candidates.map((candidate) => ({ candidate, stats: this.armStats(fromPath, candidate.path) }));
    const untried = stats.filter((s) => s.stats.n === 0);
    if (untried.length > 0) {
      return untried[rng.nextInt(untried.length)].candidate;
    }

    const totalN = stats.reduce((sum, s) => sum + s.stats.n, 1);
    let best = Number.NEGATIVE_INFINITY;
    const bestPool: Array<{ candidate: ExploreCandidate; score: number }> = [];

    for (const { candidate, stats: stat } of stats) {
      const score = stat.mean + this.options.ucbC * Math.sqrt(Math.log(totalN) / stat.n);
      if (score > best) {
        best = score;
        bestPool.length = 0;
        bestPool.push({ candidate, score });
      } else if (score === best) {
        bestPool.push({ candidate, score });
      }
    }

    return bestPool[rng.nextInt(bestPool.length)].candidate;
  }

  private pickByEpsGreedy(fromPath: string, candidates: ExploreCandidate[], rng: ExploreContext["rng"]): ExploreCandidate {
    if (candidates.length === 1) return candidates[0];
    const explore = rng.next() < this.options.eps;
    if (explore) {
      return candidates[rng.nextInt(candidates.length)];
    }

    let bestMean = Number.NEGATIVE_INFINITY;
    const bestPool: ExploreCandidate[] = [];
    for (const candidate of candidates) {
      const stats = this.armStats(fromPath, candidate.path);
      if (stats.mean > bestMean) {
        bestMean = stats.mean;
        bestPool.length = 0;
        bestPool.push(candidate);
      } else if (stats.mean === bestMean) {
        bestPool.push(candidate);
      }
    }

    return bestPool[rng.nextInt(bestPool.length)];
  }

  select(fromPath: string, candidates: ExploreCandidate[], rng: ExploreContext["rng"]): ExploreCandidate {
    const algo = this.options.algo;
    if (algo === "eps-greedy") {
      return this.pickByEpsGreedy(fromPath, candidates, rng);
    }
    return this.pickByUcb(fromPath, candidates, rng);
  }

  async onFeedback(fb: StepFeedback): Promise<void> {
    const state = this.ensureState(fb.fromPath);
    const prev = state[fb.toPath] ?? { n: 0, mean: 0 };
    const nextN = prev.n + 1;
    const nextMean = prev.mean + (fb.reward - prev.mean) / nextN;
    state[fb.toPath] = { n: nextN, mean: nextMean };
    this.model.updatedAt = new Date().toISOString();
    this.feedbackSincePersist += 1;
    this.pruneState(fb.fromPath);
    await this.persistIfNeeded();
  }

  private async persistIfNeeded(force = false): Promise<void> {
    if (!this.options.persist) return;
    if (!force && this.feedbackSincePersist < this.options.persistEvery) return;
    this.feedbackSincePersist = 0;

    const dir = path.dirname(this.options.modelPath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.options.modelPath}.tmp-${Date.now()}`;
    const payload = JSON.stringify(this.model, null, 2);
    await fs.writeFile(tmpPath, payload, "utf8");
    await fs.rename(tmpPath, this.options.modelPath);
  }

  async onEnd(): Promise<void> {
    await this.persistIfNeeded(true);
  }

  snapshot(): RLBanditSnapshot {
    const tableClone: BanditModel["table"] = JSON.parse(JSON.stringify(this.model.table ?? {}));
    const stateSummaries = Object.entries(tableClone).map(([state, arms]) => {
      let bestArm: { path: string; mean: number; pulls: number } | undefined;
      let totalPulls = 0;
      for (const [path, stats] of Object.entries(arms)) {
        totalPulls += stats.n;
        if (!bestArm || stats.mean > bestArm.mean) {
          bestArm = { path, mean: stats.mean, pulls: stats.n };
        }
      }
      return {
        state,
        arms: Object.keys(arms).length,
        totalPulls,
        bestArm,
      };
    });

    return {
      algo: this.model.algo,
      params: { ...this.model.params },
      createdAt: this.model.createdAt,
      updatedAt: this.model.updatedAt,
      summary: {
        states: stateSummaries.length,
        totalArms: stateSummaries.reduce((acc, curr) => acc + curr.arms, 0),
        totalPulls: stateSummaries.reduce((acc, curr) => acc + curr.totalPulls, 0),
        maxArmsPerState: this.options.maxArmsPerState,
      },
      states: stateSummaries,
      table: tableClone,
    };
  }
}

function readOptionsFromEnv(): RLBanditOptions {
  return {
    algo: parseAlgo(process.env.QA_EXPLORE_RL_ALGO),
    eps: parseNumberEnv(process.env.QA_EXPLORE_RL_EPS, 0.1),
    ucbC: parseNumberEnv(process.env.QA_EXPLORE_RL_UCB_C, 1.2),
    persist: (process.env.QA_EXPLORE_RL_PERSIST ?? "0") === "1",
    modelPath: process.env.QA_EXPLORE_RL_MODEL_PATH ?? path.join(".qa", "artifacts", "explore", "rl-bandit-model.json"),
    reset: (process.env.QA_EXPLORE_RL_RESET ?? "0") === "1",
    maxArmsPerState: parseNumberEnv(process.env.QA_EXPLORE_RL_MAX_ARMS_PER_STATE, 500),
    persistEvery: parseNumberEnv(process.env.QA_EXPLORE_RL_PERSIST_EVERY, 10),
    rewardMode: (process.env.QA_EXPLORE_RL_REWARD_MODE as RewardMode) === "bughunt" ? "bughunt" : "coverage",
  };
}

let learner: RLBanditLearner | null = null;

async function ensureLearner(): Promise<RLBanditLearner> {
  if (!learner) {
    learner = new RLBanditLearner(readOptionsFromEnv());
    await learner.init();
  }
  return learner;
}

export function getBanditSnapshot(): RLBanditSnapshot | null {
  if (!learner) return null;
  return learner.snapshot();
}

export const rlBanditStrategy: ExploreStrategy = {
  name: "rl-bandit",
  candidateLimit: 400,
  dedupeByPath: true,
  skipSelf: true,
  skipBeforeSlice: false,
  init: async () => {
    await ensureLearner();
  },
  nextAction: ({ candidates, rng, config, stepIndex, currentPath }) => {
    if (config.restartEvery > 0 && stepIndex > 0 && stepIndex % config.restartEvery === 0) {
      return { action: "restart", reason: "scheduled", via: "goto(restart)" };
    }

    if (candidates.length === 0) {
      return { action: "restart", reason: "dead-end", via: "goto(start)" };
    }

    const bandit = learner;
    if (!bandit) {
      throw new Error("rl-bandit strategy not initialized");
    }
    const pick = bandit.select(currentPath, candidates, rng);
    return { action: "goto", url: pick.abs, reason: "rl-bandit-pick", targetPath: pick.path, via: "goto(link)" };
  },
  onFeedback: async (fb) => {
    const bandit = await ensureLearner();
    await bandit.onFeedback(fb);
  },
  onEnd: async () => {
    const bandit = learner;
    if (bandit) await bandit.onEnd();
  },
};
