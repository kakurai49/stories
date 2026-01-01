import fs from "node:fs";
import path from "node:path";

export type QaProfile = "next" | "vite" | "generic";
export type QaPm = "npm" | "pnpm" | "yarn";

const repoRoot = path.resolve(__dirname, "..");

function readJson(p: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function detectProfile(): QaProfile {
  const forced = (process.env.QA_PROFILE ?? "").trim();
  if (forced === "next" || forced === "vite" || forced === "generic") return forced;

  const pkg = readJson(path.resolve(repoRoot, "package.json")) ?? {};
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  if (deps.next) return "next";
  if (deps.vite || deps["@vitejs/plugin-react"] || deps["@vitejs/plugin-vue"] || deps["@vitejs/plugin-svelte"]) {
    return "vite";
  }
  return "generic";
}

function detectPm(): QaPm {
  const forced = (process.env.QA_PM ?? "").trim();
  if (forced === "npm" || forced === "pnpm" || forced === "yarn") return forced;

  // lockfile-based detection
  if (fs.existsSync(path.resolve(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.resolve(repoRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

const pocketDir = path.resolve(repoRoot, ".qa");
const routesFile = path.resolve(pocketDir, "routes.txt");

function parseRoutes(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.startsWith("/") ? l : `/${l}`));
}

function loadRoutes(): string[] {
  if (process.env.QA_ROUTES) {
    return process.env.QA_ROUTES
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith("/") ? l : `/${l}`));
  }
  if (fs.existsSync(routesFile)) {
    return parseRoutes(fs.readFileSync(routesFile, "utf8"));
  }
  return ["/"];
}

const profile = detectProfile();
const pm = detectPm();

const host = process.env.QA_HOST ?? "127.0.0.1";
const port = Number(process.env.QA_PORT ?? (profile === "vite" ? "5173" : "3000"));
const baseURL = process.env.QA_BASE_URL ?? `http://${host}:${port}`;

// Allow override (most reliable)
function defaultWebCmd(): string {
  if (process.env.QA_WEB_CMD) return process.env.QA_WEB_CMD;

  // Use the repo's package manager to run dev server
  const runner = pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : "npm run";
  const pkg = readJson(path.resolve(repoRoot, "package.json")) ?? {};
  const scripts = pkg.scripts ?? {};
  const cdRoot = `cd \"${repoRoot}\" && `;
  const simpleHttp = `${cdRoot}python -m http.server ${port} --bind 0.0.0.0 --directory \"${repoRoot}\"`;

  // Prefer listening on 0.0.0.0 (Codespaces port-forward friendly),
  // but Playwright will access via 127.0.0.1 (baseURL) inside the container.
  if (profile === "next") {
    // Next: -p port, -H host
    if (scripts.dev) {
      return runner === "npm run"
        ? `${cdRoot}npm run dev -- -p ${port} -H 0.0.0.0`
        : `${cdRoot}${runner} dev -- -p ${port} -H 0.0.0.0`;
    }
    return simpleHttp;
  }

  if (profile === "vite") {
    if (scripts.dev) {
      return runner === "npm run"
        ? `${cdRoot}npm run dev -- --host 0.0.0.0 --port ${port}`
        : `${cdRoot}${runner} dev -- --host 0.0.0.0 --port ${port}`;
    }
    return simpleHttp;
  }

  // generic: just run dev
  if (scripts.dev) {
    return runner === "npm run" ? `${cdRoot}npm run dev` : `${cdRoot}${runner} dev`;
  }
  return simpleHttp;
}

export const qa = {
  pocketDir,
  artifactsDir: path.resolve(pocketDir, "artifacts"),

  profile,
  pm,

  baseURL,
  webCommand: defaultWebCmd(),

  routes: loadRoutes(),

  waitAfterGotoMs: Number(process.env.QA_WAIT_MS ?? "300"),

  // External requests are blocked by default (offline-friendly)
  blockExternal: process.env.QA_BLOCK_EXTERNAL === "0" ? false : true,

  // If strict, fail when external requests were blocked
  strictExternal: process.env.QA_STRICT_EXTERNAL === "1" ? true : false,
};

export function safeRouteName(route: string): string {
  const cleaned = (route || "/")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  if (cleaned === "" || cleaned === "/") return "home";

  return cleaned
    .replaceAll("/", "_")
    .replace(/^_+/, "")
    .replace(/[^a-zA-Z0-9_\-]/g, "_");
}
