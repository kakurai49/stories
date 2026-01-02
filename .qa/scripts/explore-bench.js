#!/usr/bin/env node
/**
 * Explore benchmark runner
 *
 * Runs exploratory Playwright tests across strategy x seed combinations,
 * collecting per-run artifacts and aggregated summaries.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_STRATEGIES = ["random-walk", "guided-coverage", "set-cover-greedy"];
const DEFAULT_SEEDS = [1, 2, 3, 4, 5];

function parseList(input, fallback) {
  if (!input) return fallback;
  const items = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function parseNumber(input, fallback) {
  if (!input) return fallback;
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
}

async function runPlaywright(runDir, env) {
  await fs.mkdir(runDir, { recursive: true });

  const child = spawn(
    "npx",
    [
      "playwright",
      "test",
      "-c",
      ".qa/playwright.config.ts",
      ".qa/tests/exploratory/random-walk.spec.ts",
      "--reporter=list",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ...env,
      },
    }
  );

  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function loadRunJson(runDir) {
  try {
    const raw = await fs.readFile(path.join(runDir, "run.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function numberStat(values) {
  if (values.length === 0) {
    return { avg: 0, median: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((acc, curr) => acc + curr, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    avg: total / values.length,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function buildSummary(strategies, runsByStrategy) {
  const aggregates = {};

  for (const strategy of strategies) {
    const runs = runsByStrategy[strategy] ?? [];
    const metrics = ["uniqueRoutes", "steps", "errorsTotal", "revisitRate", "coverageRate", "requestsTotal"];
    const stats = {};
    for (const metric of metrics) {
      const values = runs
        .map((r) => r.metrics?.[metric])
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      stats[metric] = numberStat(values);
    }

    const passed = runs.filter((r) => r.status === "passed").length;
    const failed = runs.filter((r) => r.status === "failed").length;
    aggregates[strategy] = {
      runs: runs.length,
      passed,
      failed,
      stats,
    };
  }

  return aggregates;
}

function formatMdTable(aggregates) {
  const header = [
    "| strategy | runs | passed | failed | uniqueRoutes(avg/med/min/max) | steps(avg/med/min/max) | errorsTotal(avg/med/min/max) | revisitRate(avg) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  const rows = Object.entries(aggregates).map(([strategy, data]) => {
    const ur = data.stats.uniqueRoutes;
    const steps = data.stats.steps;
    const errors = data.stats.errorsTotal;
    const revisit = data.stats.revisitRate.avg;

    const fmt = (stat) => `${stat.avg.toFixed(2)}/${stat.median.toFixed(2)}/${stat.min.toFixed(2)}/${stat.max.toFixed(2)}`;

    return `| ${strategy} | ${data.runs} | ${data.passed} | ${data.failed} | ${fmt(ur)} | ${fmt(steps)} | ${fmt(
      errors
    )} | ${revisit.toFixed(3)} |`;
  });

  return [...header, ...rows].join("\n");
}

async function writeSummaryFiles(outDir, summary) {
  await fs.mkdir(outDir, { recursive: true });
  const summaryPath = path.join(outDir, "summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  const rows = [
    ["strategy", "seed", "status", "steps", "uniqueRoutes", "revisitRate", "errorsTotal", "coverageRate", "runDir"].join(
      ","
    ),
  ];
  for (const strategy of Object.keys(summary.runs)) {
    for (const run of summary.runs[strategy]) {
      rows.push(
        [
          strategy,
          run.seed,
          run.status,
          run.metrics?.steps ?? "",
          run.metrics?.uniqueRoutes ?? "",
          run.metrics?.revisitRate ?? "",
          run.metrics?.errorsTotal ?? "",
          run.metrics?.coverageRate ?? "",
          run.runDir,
        ].join(",")
      );
    }
  }
  await fs.writeFile(path.join(outDir, "summary.csv"), rows.join("\n"), "utf8");

  const md = [
    "# Explore benchmark summary",
    "",
    `Generated at: ${summary.generatedAt}`,
    `Output directory: ${outDir}`,
    "",
    formatMdTable(summary.aggregates),
  ].join("\n");
  await fs.writeFile(path.join(outDir, "summary.md"), md, "utf8");
}

async function main() {
  const strategies = parseList(process.env.QA_EXPLORE_BENCH_STRATEGIES, DEFAULT_STRATEGIES);
  const seeds = parseList(process.env.QA_EXPLORE_BENCH_SEEDS, DEFAULT_SEEDS)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  const seconds = parseNumber(process.env.QA_EXPLORE_BENCH_SECONDS, 60);
  const startPath = process.env.QA_EXPLORE_BENCH_START_PATH?.trim() || undefined;
  const allowedPathPrefixes = parseList(process.env.QA_EXPLORE_ALLOWED_PATH_PREFIXES, []);
  const parallel = Math.max(1, parseNumber(process.env.QA_EXPLORE_BENCH_PARALLEL, 1));
  const outDir = process.env.QA_EXPLORE_BENCH_OUT_DIR || path.join(".qa", "artifacts", "explore-bench", timestamp());
  const runsDir = path.join(outDir, "runs");

  const tasks = [];
  for (const strategy of strategies) {
    for (const seed of seeds) {
      const runDir = path.join(runsDir, strategy, `seed-${seed}`);
      tasks.push({ strategy, seed, runDir });
    }
  }

  const results = [];
  const queue = [...tasks];
  const runners = Array.from({ length: parallel }).map(async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      console.log(`[bench] Running strategy=${task.strategy} seed=${task.seed}`);
      const exitCode = await runPlaywright(task.runDir, {
        QA_EXPLORE_SECONDS: String(seconds),
        QA_EXPLORE_SEED: String(task.seed),
        QA_EXPLORE_STRATEGY: task.strategy,
        QA_EXPLORE_OUTPUT_DIR: task.runDir,
        QA_EXPLORE_BENCH_RUN_DIR: task.runDir,
        QA_EXPLORE_BENCH: "1",
        QA_EXPLORE_PUBLISH: "0",
        ...(startPath ? { QA_EXPLORE_START_PATH: startPath } : {}),
      });
      results.push({ ...task, exitCode });
    }
  });

  await Promise.all(runners);

  const runsByStrategy = {};
  for (const task of tasks) {
    const runJson = await loadRunJson(task.runDir);
    const runResult = results.find((r) => r.strategy === task.strategy && r.seed === task.seed);
    const status = runJson?.meta?.status ?? (runResult && runResult.exitCode === 0 ? "passed" : "failed");
    const entry = {
      seed: task.seed,
      runDir: task.runDir,
      status,
      metrics: runJson?.metrics ?? {},
      meta: runJson?.meta ?? {},
    };
    runsByStrategy[task.strategy] = runsByStrategy[task.strategy] ?? [];
    runsByStrategy[task.strategy].push(entry);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    seconds,
    seeds,
    strategies,
    startPath,
    allowedPathPrefixes,
    outDir,
    runs: runsByStrategy,
    aggregates: buildSummary(strategies, runsByStrategy),
  };

  await writeSummaryFiles(outDir, summary);
  console.log(`[bench] Completed. Summary written to ${outDir}`);
}

main().catch((err) => {
  console.error("[bench] Unexpected failure", err);
  process.exit(1);
});
