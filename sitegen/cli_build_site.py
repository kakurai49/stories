"""CLI entrypoint for building sites directly from the micro store (v2)."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Iterable

from .build import BuildContext, build_site_from_micro_v2
from .cli import _build_label, _load_experiences, _safe_git_sha, _timestamp_for_build
from .compile_pipeline import compile_store_v2
from .micro_store import MicroStore


def _hash_dir(root: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            rel = path.relative_to(root)
            hashes[str(rel)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def _copy_output(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)


def _filter_experiences(all_experiences, selected: Iterable[str] | None):
    if not selected:
        return all_experiences
    selected_keys = set(selected)
    filtered = [exp for exp in all_experiences if exp.key in selected_keys]
    missing = selected_keys - {exp.key for exp in filtered}
    if missing:
        raise SystemExit(f"Unknown experience keys: {', '.join(sorted(missing))}")
    return filtered


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build site directly from micro store (v2).")
    parser.add_argument("--micro-store", required=True, type=Path, help="Path to micro store root directory")
    parser.add_argument(
        "--experiences",
        default=Path("config/experiences.yaml"),
        type=Path,
        help="Path to experiences.yaml",
    )
    parser.add_argument("--src", default=Path("experience_src"), type=Path, help="Template source root")
    parser.add_argument("--out", required=True, type=Path, help="Output directory for rendered site")
    parser.add_argument(
        "--routes-filename",
        dest="routes_filename",
        default="routes.json",
        help="Filename for routes JSON used to compute data-routes-href.",
    )
    parser.add_argument(
        "--experience",
        action="append",
        dest="experience_keys",
        help="Limit rendering to one or more experience keys (repeatable).",
    )
    parser.add_argument(
        "--deterministic",
        action="store_true",
        help="Use SOURCE_DATE_EPOCH (or 0) for timestamps when composing build labels.",
    )
    parser.add_argument(
        "--build-label",
        dest="build_label",
        default=None,
        help="Override build label (default combines timestamp and git SHA).",
    )
    parser.add_argument(
        "--shared",
        action="store_true",
        help="Generate shared assets (e.g., feature bootstrap) alongside HTML output.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Generate shared assets, switcher routes, and patch legacy pages.",
    )
    parser.add_argument(
        "--legacy-base",
        dest="legacy_base",
        default="nagi-s1",
        help="Base directory for patching legacy HTML when --all is set.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run two builds into temporary directories and fail if outputs differ.",
    )
    return parser.parse_args()


def _build_once(args: argparse.Namespace, out_root: Path, *, href_root: Path | None = None) -> None:
    micro_store = MicroStore.load(args.micro_store)
    compiled = compile_store_v2(micro_store)

    timestamp = _timestamp_for_build(deterministic=args.deterministic)
    git_sha = _safe_git_sha()
    build_label = _build_label(timestamp, git_sha, override=args.build_label)

    ctx = BuildContext(
        src_root=args.src,
        out_root=out_root,
        href_root=href_root,
        routes_filename=args.routes_filename,
        build_label=build_label,
    )

    experiences = _load_experiences(args.experiences)
    experiences = _filter_experiences(experiences, args.experience_keys)
    written = build_site_from_micro_v2(
        micro_store_dir=args.micro_store,
        experiences=experiences,
        ctx=ctx,
        compiled_store=compiled,
        generate_shared=args.shared or args.all,
        generate_all=args.all,
        legacy_base=Path(args.legacy_base),
    )
    print(f"Built {len(written)} file(s) into {out_root}")


def main() -> None:
    args = _parse_args()

    if args.check:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            run1 = tmp_dir / "run1"
            run2 = tmp_dir / "run2"
            href_root = args.out
            _build_once(args, run1, href_root=href_root)
            _build_once(args, run2, href_root=href_root)
            if _hash_dir(run1) != _hash_dir(run2):
                raise SystemExit("Determinism check failed: outputs differ between runs")
            _copy_output(run1, args.out)
        print(f"Determinism check passed. Output copied to {args.out}")
        return

    _build_once(args, args.out)


if __name__ == "__main__":
    main()
