import { test as base, expect } from "@playwright/test";
import { qa } from "../../qa.config";

export const test = base;

test.beforeEach(async ({ context, page }, testInfo) => {
  const blocked: string[] = [];
  (testInfo as any)._blockedRequests = blocked;

  if (qa.blockExternal) {
    const allowedOrigin = new URL(qa.baseURL).origin;

    await context.route("**/*", (route) => {
      const url = route.request().url();

      // Allow local-only schemes
      if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file:")) {
        return route.continue();
      }

      try {
        const origin = new URL(url).origin;
        if (origin === allowedOrigin) return route.continue();

        blocked.push(url);
        return route.abort();
      } catch {
        return route.continue();
      }
    });
  }

  // Visual stability: kill animations/transitions
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        scroll-behavior: auto !important;
      }
    `;

    const applyStyle = () => {
      const root = document.documentElement || document.body;
      if (!root) return false;
      root.appendChild(style);
      return true;
    };

    if (!applyStyle()) {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          applyStyle();
        },
        { once: true }
      );
    }

    // Some legacy pages expect renderMathInElement from KaTeX CDN; provide a no-op
    // stub so offline mode does not throw.
    if (typeof (window as any).renderMathInElement !== "function") {
      (window as any).renderMathInElement = () => {};
    }
  });
});

test.afterEach(async ({}, testInfo) => {
  const blocked = ((testInfo as any)._blockedRequests ?? []) as string[];
  if (blocked.length > 0) {
    await testInfo.attach("blocked-requests.txt", {
      body: blocked.join("\n"),
      contentType: "text/plain",
    });

    if (qa.strictExternal) {
      // Fail if any external request was attempted (blocked)
      expect(blocked, "External requests were attempted (blocked). Set QA_STRICT_EXTERNAL=0 to allow.").toEqual([]);
    }
  }
});

export { expect };
