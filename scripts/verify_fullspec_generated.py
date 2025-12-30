#!/usr/bin/env python3
"""Lightweight check to ensure generated home pages render full-spec sections."""

from __future__ import annotations

import sys
from pathlib import Path

from bs4 import BeautifulSoup

EXPECTED_EXPERIENCES = ("hina", "immersive", "magazine")
EXPECTED_EPISODE_COUNT = 12


def _fail(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def _load_html(path: Path) -> BeautifulSoup:
    try:
        return BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    except FileNotFoundError as exc:
        _fail(f"Missing generated file: {path}")  # pragma: no cover
        raise exc


def _validate_experience(out_dir: Path, experience: str) -> None:
    index_path = out_dir / experience / "index.html"
    soup = _load_html(index_path)

    for section_id in ("episodes", "characters"):
        if not soup.select_one(f"#{section_id}"):
            _fail(f"[{experience}] section with id='{section_id}' not found in {index_path}")

    episode_nodes = soup.select("#episodes [data-episode-id]")
    if not episode_nodes:
        episode_nodes = soup.select("#episodes li")

    if len(episode_nodes) < EXPECTED_EPISODE_COUNT:
        _fail(
            f"[{experience}] expected {EXPECTED_EPISODE_COUNT} episodes, "
            f"found {len(episode_nodes)} in {index_path}"
        )


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        _fail("Usage: python scripts/verify_fullspec_generated.py <OUT_DIR>")

    out_dir = Path(argv[1])
    if not out_dir.exists():
        _fail(f"Output directory not found: {out_dir}")

    for experience in EXPECTED_EXPERIENCES:
        _validate_experience(out_dir, experience)

    print(f"OK: verified {len(EXPECTED_EXPERIENCES)} experiences in {out_dir}")


if __name__ == "__main__":
    main(sys.argv)
