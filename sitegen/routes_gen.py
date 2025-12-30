"""Utilities for generating routes.json used by the experience switcher."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .routing import SiteRouter
from .util_fs import ensure_dir


def build_routes_payload(router: SiteRouter) -> dict:
    """Create a merged payload describing available routes per experience.

    SiteRouter is the single source of truth for route resolution; this wrapper
    exists for backward compatibility with previous call sites.
    """

    return router.routes_payload()


def write_routes_payload(payload: dict, targets: Iterable[Path]) -> list[Path]:
    """Write the JSON payload to each target path."""

    serialized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    written: list[Path] = []
    for target in {Path(path) for path in targets}:
        ensure_dir(target.parent)
        target.write_text(serialized, encoding="utf-8")
        written.append(target)
    return written


__all__ = ["build_routes_payload", "write_routes_payload"]
