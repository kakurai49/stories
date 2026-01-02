import type { Page } from "@playwright/test";
import type { ExploreCandidate } from "./types";
import { normalizePathFromUrl } from "./types";

export function isSkippableHref(href: string): boolean {
  const h = href.trim();
  return (
    !h ||
    h === "#" ||
    h.startsWith("#") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.startsWith("javascript:")
  );
}

export type CollectOptions = {
  page: Page;
  baseOrigin: string;
  currentUrl: string;
  currentPath?: string;
  limit: number;
  dedupeByPath: boolean;
  skipSelf: boolean;
  skipBeforeSlice: boolean;
  allowedPathPrefixes?: string[];
};

export async function collectCandidates(options: CollectOptions): Promise<ExploreCandidate[]> {
  const {
    page,
    baseOrigin,
    currentUrl,
    currentPath,
    limit,
    dedupeByPath,
    skipSelf,
    skipBeforeSlice,
    allowedPathPrefixes,
  } = options;

  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") || "").filter(Boolean));
  const trimmed = hrefs.map((h) => h.trim());
  const preFiltered = skipBeforeSlice ? trimmed.filter((h) => !isSkippableHref(h)) : trimmed.filter(Boolean);
  const sliced = preFiltered.slice(0, limit);

  const byPath = new Map<string, ExploreCandidate>();
  const results: ExploreCandidate[] = [];
  const normalizedAllowedPrefixes =
    allowedPathPrefixes
      ?.map((p) => (p.startsWith("/") ? p : `/${p}`))
      .map((p) => (p.length > 1 && p.endsWith("/") ? p.replace(/\/+$/, "") : p))
      .filter(Boolean) ?? [];

  for (const rawHref of sliced) {
    const href = rawHref.trim();
    if (!skipBeforeSlice && isSkippableHref(href)) continue;

    let abs: string;
    try {
      abs = new URL(href, currentUrl).toString();
    } catch {
      continue;
    }

    let origin: string;
    try {
      origin = new URL(abs).origin;
    } catch {
      continue;
    }

    if (origin !== baseOrigin) continue;

    const path = normalizePathFromUrl(abs);
    if (
      normalizedAllowedPrefixes.length > 0 &&
      !normalizedAllowedPrefixes.some((prefix) => prefix === "/" ? true : path === prefix || path.startsWith(`${prefix}/`))
    ) {
      continue;
    }
    if (skipSelf && currentPath && path === currentPath) continue;

    const candidate: ExploreCandidate = { href, abs, path };
    if (dedupeByPath) {
      if (!byPath.has(path)) byPath.set(path, candidate);
    } else {
      results.push(candidate);
    }
  }

  return dedupeByPath ? Array.from(byPath.values()) : results;
}
