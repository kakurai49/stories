"""CLI for generating and verifying MicroWorld snapshots."""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from .snapshot_micro import diff_micro_snapshot, legacy_dir_to_micro_snapshot, write_micro_snapshot
from .verify_roundtrip import verify_roundtrip_all


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate MicroWorld snapshot from legacy posts")
    parser.add_argument("--posts", type=Path, required=True, help="Path to legacy posts directory")
    parser.add_argument("--out", type=Path, required=True, help="Output directory for micro snapshot")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Regenerate snapshot in a temp dir, compare with existing snapshot, and verify round-trip equality",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    entities, blocks, index = legacy_dir_to_micro_snapshot(args.posts, args.out)

    if args.check:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            write_micro_snapshot(tmp_path, entities, blocks, index)
            diff = diff_micro_snapshot(args.out, tmp_path)
            ok, errors = verify_roundtrip_all(args.posts)

            exit_code = 0
            if diff:
                sys.stderr.write(diff)
                exit_code = 1
            if not ok:
                sys.stderr.write("\n".join(errors))
                exit_code = 1
            if exit_code:
                sys.exit(exit_code)
        return

    write_micro_snapshot(args.out, entities, blocks, index)


if __name__ == "__main__":
    main()
