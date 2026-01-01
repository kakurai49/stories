"""CLI entrypoint to build legacy-compatible posts from micro world (deprecated)."""

from __future__ import annotations

import argparse
from pathlib import Path

from .compile_pipeline import build_posts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Deprecated: build legacy-compatible dist/posts/*.json from micro store"
    )
    parser.add_argument("--micro", type=Path, required=True, help="Path to micro world directory")
    parser.add_argument("--out", type=Path, required=True, help="Output directory for dist files")
    args = parser.parse_args()

    build_posts(args.micro, args.out)


if __name__ == "__main__":
    main()
