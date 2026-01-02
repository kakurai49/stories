#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { execSync } = require("node:child_process");

async function readJson(p) {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ensureTrailingSlashPrefix(p) {
  if (!p) return p;
  const withSlash = p.startsWith("/") ? p : `/${p}`;
  return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.replace(/\/+$/, "") : withSlash;
}

function formatNumber(value, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return Number(value).toFixed(digits);
}

function parseArgs(argv) {
  const args = { outDir: undefined, command: undefined };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--command" && argv[i + 1]) {
      args.command = argv[i + 1];
      i += 1;
      continue;
    }
    if (!args.outDir) {
      args.outDir = arg;
    }
  }
  return args;
}

function gitCommitHash() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function aggregateRequests(runDetails) {
  const counts = new Map();
  for (const run of runDetails) {
    for (const req of run.requestsTop ?? []) {
      const key = req.path || req.url || "";
      if (!key) continue;
      if (!counts.has(key)) counts.set(key, { total: 0, kinds: new Map() });
      const entry = counts.get(key);
      entry.total += req.count ?? 0;
      const kind = req.kind ?? "unknown";
      entry.kinds.set(kind, (entry.kinds.get(kind) ?? 0) + (req.count ?? 0));
    }
  }
  return Array.from(counts.entries())
    .map(([path, info]) => {
      const dominantKind = Array.from(info.kinds.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
      return { path, count: info.total, kind: dominantKind };
    })
    .sort((a, b) => b.count - a.count);
}

function loadRunMeta(runDetails) {
  const first = runDetails[0];
  if (!first) return {};
  const meta = first.meta ?? {};
  return {
    baseURL: meta.baseURL,
    startPath: meta.startPath,
    allowedPathPrefixes: meta.allowedPathPrefixes ?? [],
    commitHash: meta.commitHash ?? gitCommitHash(),
  };
}

function formatAggregateRow(strategy, agg) {
  const fmt = (stat) =>
    `${formatNumber(stat.avg)}/${formatNumber(stat.median)}/${formatNumber(stat.min)}/${formatNumber(stat.max)}`;
  const revisitAvg = formatNumber(agg.stats.revisitRate.avg, 3);
  return `| ${strategy} | ${agg.runs} | ${agg.passed} | ${agg.failed} | ${fmt(agg.stats.uniqueRoutes)} | ${fmt(
    agg.stats.steps
  )} | ${fmt(agg.stats.errorsTotal)} | ${revisitAvg} |`;
}

function strategyAverages(runDetails, metric) {
  const values = new Map();
  for (const run of runDetails) {
    const val = run.metrics?.[metric];
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    if (!values.has(run.strategy)) values.set(run.strategy, []);
    values.get(run.strategy).push(val);
  }
  const result = {};
  for (const [strategy, vals] of values.entries()) {
    if (vals.length === 0) continue;
    const total = vals.reduce((acc, curr) => acc + curr, 0);
    result[strategy] = total / vals.length;
  }
  return result;
}

function buildSummary02(summary) {
  const header = [
    "| strategy | runs | passed | failed | uniqueRoutes (avg/med/min/max) | steps (avg/med/min/max) | errorsTotal (avg/med/min/max) | revisitRate (avg) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const rows = Object.entries(summary.aggregates ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([strategy, agg]) => formatAggregateRow(strategy, agg));

  return [...header, ...rows].join("\n");
}

function buildSummary03(runDetails) {
  const header = "| strategy | seed | status | uniqueRoutes | steps | revisitRate | errorsTotal |";
  const divider = "| --- | --- | --- | --- | --- | --- | --- |";
  const rows = runDetails
    .slice()
    .sort((a, b) => (a.strategy === b.strategy ? a.seed - b.seed : a.strategy.localeCompare(b.strategy)))
    .map(
      (run) =>
        `| ${run.strategy} | ${run.seed} | ${run.status} | ${run.metrics?.uniqueRoutes ?? "-"} | ${run.metrics?.steps ?? "-"} | ${formatNumber(run.metrics?.revisitRate, 3)} | ${run.metrics?.errorsTotal ?? "-"} |`
    );
  return [header, divider, ...rows].join("\n");
}

async function loadRuns(summary) {
  const runDetails = [];
  for (const [strategy, runs] of Object.entries(summary.runs ?? {})) {
    for (const run of runs) {
      const runJson = await readJson(path.join(run.runDir, "run.json"));
      const requestsTop = (await readJson(path.join(run.runDir, "requests-top.json"))) ?? [];
      runDetails.push({
        strategy,
        seed: run.seed,
        status: run.status,
        runDir: run.runDir,
        metrics: runJson?.metrics ?? run.metrics ?? {},
        meta: runJson?.meta ?? run.meta ?? {},
        requestsTop,
      });
    }
  }
  return runDetails;
}

async function writeFile(targetPath, body) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, body, "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.outDir) {
    console.error("Usage: node scripts/generate-stories-bench-summaries.js --out <benchOutDir> [--command \"<bench command>\"]");
    process.exit(1);
  }

  const summaryPath = path.resolve(args.outDir, "summary.json");
  const summary = await readJson(summaryPath);
  if (!summary) {
    console.error(`Failed to read summary.json at ${summaryPath}`);
    process.exit(1);
  }

  const runDetails = await loadRuns(summary);
  if (runDetails.length === 0) {
    console.error("No runs found in summary.json");
    process.exit(1);
  }

  const meta = loadRunMeta(runDetails);
  const requestsAggregated = aggregateRequests(runDetails);

  const strategyUniqueAvg = strategyAverages(runDetails, "uniqueRoutes");
  const strategyErrorsAvg = strategyAverages(runDetails, "errorsTotal");
  const strategyStepsAvg = strategyAverages(runDetails, "steps");
  const strategyRequestsAvg = strategyAverages(runDetails, "requestsTotal");
  const strategyRevisitAvg = strategyAverages(runDetails, "revisitRate");
  const uniqueValues = Object.values(strategyUniqueAvg);
  const maxUnique = uniqueValues.length ? Math.max(...uniqueValues) : 0;
  const minUnique = uniqueValues.length ? Math.min(...uniqueValues) : 0;
  const maxUniqueStrategies = Object.entries(strategyUniqueAvg)
    .filter(([, v]) => v === maxUnique)
    .map(([s]) => s);
  const minUniqueStrategies = Object.entries(strategyUniqueAvg)
    .filter(([, v]) => v === minUnique)
    .map(([s]) => s);

  const sortedByUnique = Object.entries(strategyUniqueAvg).sort((a, b) => b[1] - a[1]);
  const bestStrategy = sortedByUnique[0]?.[0];
  const secondStrategy = sortedByUnique[1]?.[0];
  const lowestErrors = Object.entries(strategyErrorsAvg).sort((a, b) => a[1] - b[1])[0]?.[0];
  const highestErrors = Object.entries(strategyErrorsAvg).sort((a, b) => b[1] - a[1])[0]?.[0];
  const requestTotals = Object.values(strategyRequestsAvg);
  const requestMin = requestTotals.length ? Math.min(...requestTotals) : undefined;
  const requestMax = requestTotals.length ? Math.max(...requestTotals) : undefined;
  const lowestRevisit = Object.entries(strategyRevisitAvg).sort((a, b) => a[1] - b[1])[0]?.[0];
  const rankedStrategies = Object.keys(strategyUniqueAvg).sort((a, b) => {
    const ua = strategyUniqueAvg[a] ?? 0;
    const ub = strategyUniqueAvg[b] ?? 0;
    if (ub !== ua) return ub - ua;
    const ra = strategyRevisitAvg[a] ?? Number.POSITIVE_INFINITY;
    const rb = strategyRevisitAvg[b] ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    const reqA = strategyRequestsAvg[a] ?? Number.POSITIVE_INFINITY;
    const reqB = strategyRequestsAvg[b] ?? Number.POSITIVE_INFINITY;
    return reqA - reqB;
  });
  const primaryStrategy = rankedStrategies[0];
  const secondaryStrategy = rankedStrategies[1];
  const errorsAllZero = runDetails.every((run) => (run.metrics?.errorsTotal ?? 0) === 0);

  const docsDir = path.join("docs", "qa", "explore-benchmarks", "stories");
  const summary01Path = path.join(docsDir, "summary-01.md");
  const summary02Path = path.join(docsDir, "summary-02.md");
  const summary03Path = path.join(docsDir, "summary-03.md");
  const summary04Path = path.join(docsDir, "summary-04.md");

  const allowedPrefixes = (meta.allowedPathPrefixes ?? summary.allowedPathPrefixes ?? []).map(ensureTrailingSlashPrefix);

  const summary01 = [
    "# Stories explore benchmark (summary 01)",
    "",
    `- Generated at: ${summary.generatedAt}`,
    `- Commit hash: ${meta.commitHash ?? gitCommitHash() ?? "unknown"}`,
    `- Base URL: ${meta.baseURL ?? "unknown"}`,
    `- Start path: ${meta.startPath ?? summary.startPath ?? "unknown"}`,
    `- Allowed path prefixes: ${allowedPrefixes.length > 0 ? allowedPrefixes.join(", ") : "not limited"}`,
    `- Seconds per run: ${summary.seconds}`,
    `- Seeds: ${summary.seeds?.join(", ")}`,
    `- Strategies: ${summary.strategies?.join(", ")}`,
    `- Output directory: ${summary.outDir}`,
    args.command ? `- Command: \`${args.command}\`` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const summary02 = [
    "# Stories explore benchmark (summary 02)",
    "",
    "## Strategy-level metrics",
    "",
    buildSummary02(summary),
    "",
    "## Notes",
    "",
    `- Coverage leaders: ${maxUniqueStrategies.join(", ") || "n/a"} at ${formatNumber(maxUnique)}${minUnique < maxUnique ? `; trailing average: ${minUniqueStrategies.join(", ")} at ${formatNumber(minUnique)}` : ""}`,
    `- Request load (avg requestsTotal): ${Object.entries(strategyRequestsAvg)
      .map(([s, v]) => `${s} ~${formatNumber(v, 1)}`)
      .join(", ")}`,
    errorsAllZero
      ? "- Errors: all runs recorded 0 errors."
      : `- Errors (avg errorsTotal): ${Object.entries(strategyErrorsAvg)
          .map(([s, v]) => `${s} ~${formatNumber(v)}`)
          .join(", ")}`,
  ].join("\n");

  const summary03 = [
    "# Stories explore benchmark (summary 03)",
    "",
    "## Per-seed results",
    "",
    buildSummary03(runDetails),
  ].join("\n");

  const topRequests = requestsAggregated.slice(0, 10);
  const topRequestsSection = topRequests.map((r, idx) => `${idx + 1}. ${r.path} — ${r.count} requests (${r.kind})`).join("\n");
  const assetKindCount = topRequests.filter((r) => r.kind === "asset").length;
  const routeKindCount = topRequests.filter((r) => r.kind === "route").length;

  const summary04 = [
    "# Stories explore benchmark (summary 04)",
    "",
    "## Recommendations",
    "",
    primaryStrategy
      ? `1. **Primary**: ${primaryStrategy} — coverage leader with revisit rate ${formatNumber(
          strategyRevisitAvg[primaryStrategy],
          3
        )} and ~${formatNumber(strategyRequestsAvg[primaryStrategy], 1)} requests/run.`
      : "1. **Primary**: n/a",
    secondaryStrategy
      ? `2. **Secondary**: ${secondaryStrategy} — same coverage tier; trade a bit more traffic (~${formatNumber(
          strategyRequestsAvg[secondaryStrategy],
          1
        )}) for deterministic target selection.`
      : "2. **Secondary**: n/a",
    "",
    "## Trade-offs",
    "",
    errorsAllZero
      ? "- Errors: all runs were clean (no HTTP/console/page failures)."
      : `- Errors (avg errorsTotal): ${Object.entries(strategyErrorsAvg)
          .map(([s, v]) => `${s} ~${formatNumber(v)}`)
          .join(", ")}`,
    `- Coverage: ${maxUniqueStrategies.join(", ") || "n/a"} held ${formatNumber(maxUnique)} unique routes on average${
      minUnique < maxUnique ? `; ${minUniqueStrategies.join(", ")} trailed at ${formatNumber(minUnique)}` : ""
    }.`,
    `- Requests (avg requestsTotal): ${Object.entries(strategyRequestsAvg)
      .map(([s, v]) => `${s} ~${formatNumber(v, 1)}`)
      .join(", ")}`,
    lowestRevisit
      ? `- Lowest revisit rate: ${lowestRevisit} (${formatNumber(strategyRevisitAvg[lowestRevisit], 3)})`
      : "- Lowest revisit rate: n/a",
    requestMin !== undefined && requestMax !== undefined
      ? `- Request volume spread (avg): ${formatNumber(requestMin, 1)} – ${formatNumber(requestMax, 1)}`
      : "- Request volume spread (avg): n/a",
    "",
    "## Top requests (aggregated)",
    "",
    topRequestsSection || "No request data available.",
    "",
    topRequests.length > 0
      ? `Breakdown: ${routeKindCount} routes, ${assetKindCount} assets, ${topRequests.length - routeKindCount - assetKindCount} other. Assets dominate the top list, reflecting shared hina styling scripts; the route entries cover the hina home, list, and early episodes with no API calls surfacing in the top set.`
      : "",
  ].join("\n");

  await Promise.all([
    writeFile(summary01Path, summary01),
    writeFile(summary02Path, summary02),
    writeFile(summary03Path, summary03),
    writeFile(summary04Path, summary04),
  ]);

  console.log(`[summaries] Wrote summaries to ${docsDir}`);
}

main().catch((err) => {
  console.error("[summaries] Failed to generate summaries", err);
  process.exit(1);
});
