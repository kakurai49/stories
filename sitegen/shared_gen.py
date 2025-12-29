"""Generators for shared assets used across experiences."""

from __future__ import annotations

from pathlib import Path

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


__all__ = ["generate_init_features_js"]
