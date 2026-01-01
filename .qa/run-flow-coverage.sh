#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# detect package manager
PM_RUN="npm run"
if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
  PM_RUN="pnpm"
elif [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
  PM_RUN="yarn"
fi

mkdir -p docs/qa

echo "== [1/3] qa:fixlist (flow + analyze + publish docs) =="
QA_FLOW_PUBLISH=1 $PM_RUN qa:fixlist

echo "== [2/3] guided explore (prefer unvisited) =="
QA_EXPLORE_SECONDS="${QA_EXPLORE_SECONDS:-60}" QA_EXPLORE_PUBLISH=1 $PM_RUN qa:explore:guided

echo "== [3/3] write docs/qa/QA_POCKET_RUNLOG.md =="
node <<'NODE'
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const analysisPath = path.resolve(root, ".qa", "artifacts", "flow", "flow-analysis.json");
const runlogPath = path.resolve(root, "docs", "qa", "QA_POCKET_RUNLOG.md");

let analysis = null;
try {
  analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
} catch (e) {
  console.error("ERROR: flow-analysis.json not found. Did qa:fixlist succeed?");
  process.exit(1);
}

const now = new Date().toISOString();
const counts = analysis.counts || {};
const unreachable = (analysis.unreachable || []).slice(0, 50);

let block = "";
block += `\n## Run ${now}\n\n`;
block += `Commands:\n`;
block += `- QA_FLOW_PUBLISH=1 qa:fixlist\n`;
block += `- QA_EXPLORE_SECONDS=${process.env.QA_EXPLORE_SECONDS || 60} qa:explore:guided\n\n`;
block += `Outputs (docs):\n`;
block += `- docs/qa/screen-flow.md\n`;
block += `- docs/qa/screen-flow.json\n`;
block += `- docs/qa/flow-analysis.md\n`;
block += `- docs/qa/flow-analysis.json\n`;
block += `- docs/qa/link-fix-list.md\n`;
block += `- docs/qa/guided-coverage.json\n\n`;
block += `Summary:\n`;
block += `- knownRoutes: ${counts.knownRoutes ?? "?"} (source: ${analysis.meta?.knownRoutesSource ?? "?"})\n`;
block += `- crawledPages: ${counts.crawledPages ?? "?"}\n`;
block += `- edges: ${counts.edges ?? "?"}\n`;
block += `- unreachable: ${counts.unreachable ?? "?"}\n`;
block += `- deadEnds: ${counts.deadEnds ?? "?"}\n`;
block += `- broken: ${counts.broken ?? "?"}\n`;
block += `- blockedExternalRequests: ${counts.blockedExternalRequests ?? "?"}\n\n`;

if (unreachable.length > 0) {
  block += `Top unreachable (first ${unreachable.length}):\n`;
  for (const u of unreachable) {
    const http = u.status === null ? "ERR" : String(u.status);
    const from = (u.suggestedFrom || []).slice(0, 4).join(", ");
    block += `- ${u.route} (HTTP ${http}) from: ${from}\n`;
  }
  block += `\n(See full list: docs/qa/link-fix-list.md)\n`;
} else {
  block += `No unreachable routes detected (or known-routes list is empty).\n`;
}

let text = "";
if (fs.existsSync(runlogPath)) {
  text = fs.readFileSync(runlogPath, "utf8");
} else {
  text = "# QA Pocket Run Log\n\nこのファイルは qa:fixlist / guided explore の実行ログを追記します。\n";
}
if (!text.endsWith("\n")) text += "\n";
text += block;

fs.mkdirSync(path.dirname(runlogPath), { recursive: true });
fs.writeFileSync(runlogPath, text, "utf8");

console.log("✅ wrote:", runlogPath);
NODE

echo "✅ Done. Check docs/qa/link-fix-list.md and docs/qa/QA_POCKET_RUNLOG.md"
