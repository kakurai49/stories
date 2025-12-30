"""Utilities for generating routes.json used by the experience switcher."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from .models import ContentItem, ExperienceSpec
from .util_fs import ensure_dir


def _detail_href(experience: ExperienceSpec, slug: str) -> str:
    """Build a detail href by substituting the slug into the pattern."""

    return experience.route_patterns.detail.replace("{slug}", slug)


def _pretty_href(target: Path, base: Path, *, collapse_index: bool = True) -> str:
    """Return a relative href and optionally collapse index.html into a trailing slash."""

    href = Path(os.path.relpath(target, base)).as_posix()
    if collapse_index and href.endswith("index.html"):
        href = href[: -len("index.html")]
        if not href:
            return "./"
        if not href.endswith("/"):
            href += "/"
    return href


def build_routes_payload(
    experiences: list[ExperienceSpec], items: list[ContentItem], *, out_root: Path, routes_filename: str = "routes.json"
) -> dict:
    """Create a merged payload describing available routes per experience.

    The resulting structure is optimized for the client-side view switcher:
    {
      "order": ["ruri", "hina"],
      "routes": {
        "ruri": {"home": "../index.html", "content": {"ep01": "../story1.html"}},
        "hina": {"home": "hina/", "content": {"ep01": "hina/ep01/"}}
      }
    }
    """

    order = [exp.key for exp in experiences]
    routes: dict[str, dict] = {}
    base_dir = (out_root / routes_filename).parent

    for experience in experiences:
        targeted = [item for item in items if item.experience == experience.key]
        if not targeted:
            targeted = items

        if experience.kind == "legacy":
            home_source = experience.home or experience.route_patterns.home
            home = Path(home_source)
            content_map = {cid: Path(href) for cid, href in experience.content.items()}
            if not content_map:
                for item in targeted:
                    content_map[item.content_id] = Path(_detail_href(experience, item.content_id))

            routes[experience.key] = {
                "home": _pretty_href(home, base_dir, collapse_index=False),
                "content": {cid: _pretty_href(href, base_dir, collapse_index=False) for cid, href in content_map.items()},
            }
            continue

        output_dir = Path(experience.output_dir or experience.key)
        home_path = out_root / output_dir / "index.html"
        list_path = out_root / output_dir / "list" / "index.html"

        content_map: dict[str, str] = {}
        for item in targeted:
            if item.page_type in {"about", "character"}:
                continue
            slug = item.content_id
            detail_path = out_root / output_dir / "posts" / slug / "index.html"
            content_map[slug] = _pretty_href(detail_path, base_dir)

        routes[experience.key] = {
            "home": _pretty_href(home_path, base_dir),
            "list": _pretty_href(list_path, base_dir),
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
