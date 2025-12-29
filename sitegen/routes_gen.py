"""Utilities for generating routes.json used by the experience switcher."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .models import ContentItem, ExperienceSpec
from .util_fs import ensure_dir


def _detail_href(experience: ExperienceSpec, slug: str) -> str:
    """Build a detail href by substituting the slug into the pattern."""

    return experience.route_patterns.detail.replace("{slug}", slug)


def build_routes_payload(
    experiences: list[ExperienceSpec], items: list[ContentItem]
) -> dict:
    """Create a merged payload describing available routes per experience.

    The resulting structure is optimized for the client-side view switcher:
    {
      "order": ["ruri", "hina"],
      "routes": {
        "ruri": {"home": "/index.html", "content": {"ep01": "/story1.html"}},
        "hina": {"home": "/hina/", "content": {"ep01": "/hina/ep01"}}
      }
    }
    """

    order = [exp.key for exp in experiences]
    routes: dict[str, dict] = {}

    for experience in experiences:
        targeted = [item for item in items if item.experience == experience.key]
        if not targeted:
            targeted = items

        if experience.kind == "legacy":
            home = (
                f"/{(experience.home or '').lstrip('/')}"
                if experience.home
                else experience.route_patterns.home
            )
            content_map = {
                cid: f"/{href.lstrip('/')}" for cid, href in experience.content.items()
            }
            if not content_map:
                for item in targeted:
                    content_map[item.content_id] = _detail_href(experience, item.content_id)

            routes[experience.key] = {"home": home, "content": content_map}
            continue

        content_map: dict[str, str] = {}
        for item in items:
            slug = item.content_id
            content_map[slug] = _detail_href(experience, slug)

        routes[experience.key] = {
            "home": experience.route_patterns.home,
            "list": experience.route_patterns.list,
            "content": content_map,
        }

    return {"order": order, "routes": routes}


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
