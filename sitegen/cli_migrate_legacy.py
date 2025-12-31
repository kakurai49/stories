"""CLI entrypoint for migrating legacy posts to micro world."""

from __future__ import annotations

import argparse
from pathlib import Path

from .migrate_legacy import migrate_legacy_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate legacy posts to micro world format")
    parser.add_argument("--posts", type=Path, required=True, help="Path to legacy posts directory")
    parser.add_argument("--out", type=Path, required=True, help="Output directory for micro files")
    args = parser.parse_args()

    migrate_legacy_dir(args.posts, args.out)


if __name__ == "__main__":
    main()
