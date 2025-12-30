import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ensureTrailingSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

const normalizeCandidate = (href: string, baseURL: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed || trimmed === '#') return null;
  if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) return null;
  if (trimmed.startsWith('#')) return null;

  try {
    const candidate = new URL(trimmed, baseURL);
    const base = new URL(baseURL);
    if (candidate.origin !== base.origin) return null;
    return candidate.toString();
  } catch {
    return null;
  }
};

const slugFromUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    const pathPart = parsed.pathname.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
    const slug = pathPart.length > 0 ? pathPart : 'home';
    return slug.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page';
  } catch {
    return 'page';
  }
};

const fallbackPaths = [
  '/index.html',
  '/story1.html',
  '/story2.html',
  '/story3.html',
  '/story4.html',
  '/story5.html',
  '/generated/hina/index.html',
  '/generated/immersive/index.html',
  '/generated/magazine/index.html',
];

test('captures GitHub Pages screenshots', async ({ page, request }) => {
  const baseURL = test.info().project.use.baseURL;
  expect(baseURL, 'Base URL must be resolved before running the test').toBeTruthy();
  const resolvedBase = ensureTrailingSlash(baseURL!);

  const screenshotsDir = path.join('artifacts', 'screenshots');
  await fs.promises.mkdir(screenshotsDir, { recursive: true });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  let landingUrl = resolvedBase;
  let response = await page.goto(resolvedBase, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() >= 400) {
    const indexFallback = new URL('index.html', resolvedBase).toString();
    if (indexFallback !== resolvedBase) {
      landingUrl = indexFallback;
      response = await page.goto(indexFallback, { waitUntil: 'domcontentloaded' });
    }
  }
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  expect(response?.status()).toBeLessThan(400);

  const discoveredLinks = await page.$$eval(
    'a[href]',
    (anchors, base) =>
      Array.from(new Set(
        anchors
          .map((anchor) => anchor.getAttribute('href') || '')
          .filter((href) => href && href !== '#')
          .map((href) => {
            try {
              const candidate = new URL(href, base);
              const baseUrl = new URL(base);
              if (candidate.origin !== baseUrl.origin) return null;
              if (/^(mailto:|tel:|javascript:)/i.test(href)) return null;
              if (href.trim() === '#') return null;
              return candidate.toString();
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[],
      )),
    landingUrl,
  );

  const candidates = new Set<string>();
  discoveredLinks.forEach((href) => {
    const normalized = normalizeCandidate(href, landingUrl);
    if (normalized) candidates.add(normalized);
  });

  for (const fallback of fallbackPaths) {
    if (candidates.size >= 5) break;
    const url = new URL(fallback, resolvedBase).toString();
    if (candidates.has(url)) continue;
    try {
      const fallbackResponse = await request.get(url, { failOnStatusCode: false });
      if (fallbackResponse.status() >= 200 && fallbackResponse.status() < 400) {
        candidates.add(url);
      }
    } catch (error) {
      test.info().annotations.push({
        type: 'issue',
        description: `Skipping fallback ${url}: ${(error as Error).message}`,
      });
    }
  }

  if (candidates.size < 2) {
    [
      'story1.html',
      'story2.html',
      'generated/hina/index.html',
      'generated/immersive/index.html',
    ].forEach((pathCandidate) => {
      if (candidates.size >= 5) return;
      candidates.add(new URL(pathCandidate, resolvedBase).toString());
    });
  }

  const targetUrls = [landingUrl, ...Array.from(candidates).slice(0, 4)].slice(0, 3);
  expect(targetUrls.length).toBeGreaterThanOrEqual(3);

  const visited: string[] = [];

  for (const [index, url] of targetUrls.entries()) {
    const navigation = await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    if (navigation) {
      expect(navigation.status(), `Failed to load ${url}`).toBeLessThan(400);
    }
    const filename = `${String(index + 1).padStart(2, '0')}_${slugFromUrl(url)}.png`;
    const outputPath = path.join(screenshotsDir, filename);
    await page.screenshot({ path: outputPath, fullPage: true });
    visited.push(`${filename}: ${url}`);
  }

  if (pageErrors.length || consoleErrors.length) {
    const combined = [
      pageErrors.length ? `Page errors:\\n${pageErrors.join('\\n')}` : null,
      consoleErrors.length ? `Console errors:\\n${consoleErrors.join('\\n')}` : null,
    ]
      .filter(Boolean)
      .join('\\n\\n');
    test.info().annotations.push({ type: 'issue', description: combined });
  }

  test.info().attach('captured-urls', {
    body: visited.join('\\n'),
    contentType: 'text/plain',
  });

  console.log('Captured pages:', visited);
});
