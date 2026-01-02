#!/usr/bin/env python3
"""Copy canonical v2 outputs into backward-compatible alias directories."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ALIAS = "generated"
CANONICAL = "generated_v2"
SEASONS = ("nagi-s2", "nagi-s3")


def sync_alias(season: str, *, alias: str = DEFAULT_ALIAS, force: bool = False) -> Path:
    base = REPO_ROOT / season
    canonical_dir = base / CANONICAL
    alias_dir = base / alias

    if not canonical_dir.exists():
        raise FileNotFoundError(f"Canonical output not found: {canonical_dir}")
    if not canonical_dir.is_dir():
        raise NotADirectoryError(f"Canonical output is not a directory: {canonical_dir}")

    if alias_dir.exists():
        if not force:
            raise FileExistsError(
                f"Alias output already exists: {alias_dir} (use --force to overwrite)"
            )
        shutil.rmtree(alias_dir)

    shutil.copytree(canonical_dir, alias_dir)
    return alias_dir


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy canonical v2 outputs into backward-compatible alias directories."
    )
    parser.add_argument(
        "--season",
        action="append",
        choices=SEASONS,
        help="Season(s) to sync. Default: all.",
    )
    parser.add_argument(
        "--alias",
        default=DEFAULT_ALIAS,
        help=f"Alias directory name (default: {DEFAULT_ALIAS}).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing alias directories.",
    )
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    seasons = args.season or SEASONS

    for season in seasons:
        alias_dir = sync_alias(season, alias=args.alias, force=args.force)
        print(f"[{season}] aliased output copied to {alias_dir}")


if __name__ == "__main__":
    main()
