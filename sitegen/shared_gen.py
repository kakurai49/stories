"""Generators for shared assets used across experiences."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .util_fs import ensure_dir


def generate_init_features_js(out_dir: Path) -> Path:
    """Write a defensive bootstrap for feature detection.

    The script lightly inspects the content body and logs any declared features
    without interrupting page rendering when errors occur.
    """

    target_dir = ensure_dir(out_dir / "shared" / "features")
    target_path = target_dir / "init-features.js"
    script = """
(function initFeatures() {
  try {
    const contentBody = document.querySelector('[data-content-body]');
    if (!contentBody) return;

    const features = contentBody.getAttribute('data-features') || '';
    if (features) {
      console.info('[features:init]', features);
    }
  } catch (error) {
    console.info('[features:init] skipped due to error', error);
  }
})();
"""
    target_path.write_text(script.lstrip(), encoding="utf-8")
    return target_path


SWITCHER_JS = """
(function experienceSwitcher() {
  const button = document.querySelector('button.view-switcher[data-action="switch-experience"]');
  const { experience: current, contentId, routesHref } = document.body.dataset || {};
  if (!button || !routesHref || !current) return;

  const routesUrl = new URL(routesHref, window.location.href);
  let cache = null;

  async function loadRoutes() {
    if (cache) return cache;
    const response = await fetch(routesUrl.href);
    if (!response.ok) {
      throw new Error(`Failed to load routes: ${response.status}`);
    }
    cache = await response.json();
    return cache;
  }

  button.addEventListener('click', async () => {
    try {
      const payload = await loadRoutes();
      const order = payload.order || [];
      if (!order.length) return;

      const currentIndex = order.indexOf(current);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % order.length;
      const nextKey = order[nextIndex];
      const nextRoutes = payload.routes?.[nextKey];
      if (!nextRoutes) return;

      let target = null;
      if (contentId && nextRoutes.content && nextRoutes.content[contentId]) {
        target = nextRoutes.content[contentId];
      }
      if (!target) {
        target = nextRoutes.home || null;
      }
      if (!target) return;

      const resolved = new URL(target, routesUrl.href);
      window.location.href = resolved.href;
    } catch (error) {
      console.warn("[switcher] navigation skipped", error);
    }
  });
})();
"""

SWITCHER_CSS = """
.view-switcher {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  padding: 10px 12px;
  font: inherit;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}

.view-switcher:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.26);
}
"""


def generate_switcher_assets(target_roots: Iterable[Path]) -> list[Path]:
    """Write shared switcher assets into each target root's shared directory."""

    written: list[Path] = []
    for root in {Path(path) for path in target_roots}:
        shared_dir = ensure_dir(root / "shared")
        js_path = shared_dir / "switcher.js"
        css_path = shared_dir / "switcher.css"
        js_path.write_text(SWITCHER_JS.lstrip() + "\n", encoding="utf-8")
        css_path.write_text(SWITCHER_CSS.lstrip() + "\n", encoding="utf-8")
        written.extend([js_path, css_path])
    return written


__all__ = ["generate_init_features_js", "generate_switcher_assets"]
