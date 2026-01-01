#!/usr/bin/env python3
"""Build nagi-s2 / nagi-s3 micro stores and HTML previews for v2 flow."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class SeasonSpec:
    key: str
    markdown: Path
    micro_out: Path
    html_out: Path


SEASONS: dict[str, SeasonSpec] = {
    "nagi-s2": SeasonSpec(
        key="nagi-s2",
        markdown=REPO_ROOT / "nagi-s2" / "nagi-s2.md",
        micro_out=REPO_ROOT / "content" / "micro" / "nagi-s2",
        html_out=REPO_ROOT / "nagi-s2" / "generated_v2",
    ),
    "nagi-s3": SeasonSpec(
        key="nagi-s3",
        markdown=REPO_ROOT / "nagi-s3" / "nagi-s3.md",
        micro_out=REPO_ROOT / "content" / "micro" / "nagi-s3",
        html_out=REPO_ROOT / "nagi-s3" / "generated_v2",
    ),
}


def _run(cmd: list[str]) -> None:
    print("$ " + " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=REPO_ROOT)


def _count_episode_html(out_dir: Path, season: str) -> int:
    return len(list(out_dir.rglob(f"{season}-ep*.html")))


def _clean_outputs(*paths: Path) -> None:
    for path in paths:
        if path.exists():
            shutil.rmtree(path)


def build_preview_for_season(
    spec: SeasonSpec,
    *,
    variant: str,
    expected_blocks: int,
    extra_tags: Iterable[str],
    force: bool,
    clean_html: bool,
) -> None:
    if not spec.markdown.exists():
        raise FileNotFoundError(f"Markdown input not found: {spec.markdown}")

    if force:
        _clean_outputs(spec.micro_out)
    if clean_html:
        _clean_outputs(spec.html_out)

    micro_cmd = [
        sys.executable,
        str(REPO_ROOT / "scripts" / "markdown_to_micro_v2.py"),
        "--input",
        str(spec.markdown),
        "--out",
        str(spec.micro_out),
        "--season",
        spec.key,
        "--variant",
        variant,
        "--expected-blocks",
        str(expected_blocks),
    ]
    if force:
        micro_cmd.append("--force")
    for tag in extra_tags:
        micro_cmd.extend(["--tag", tag])
    _run(micro_cmd)

    build_cmd = [
        sys.executable,
        "-m",
        "sitegen.cli_build_site",
        "--micro-store",
        str(spec.micro_out),
        "--experiences",
        "config/experiences.yaml",
        "--src",
        "experience_src",
        "--out",
        str(spec.html_out),
        "--shared",
        "--deterministic",
        "--check",
        "--experience",
        variant,
    ]
    _run(build_cmd)

    episode_html = _count_episode_html(spec.html_out, spec.key)
    print(f"[{spec.key}] episodes rendered: {episode_html} (expected {expected_blocks})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build preview HTML from nagi-s2/nagi-s3 markdown via v2 flow.")
    parser.add_argument(
        "--season",
        choices=sorted(SEASONS.keys()),
        action="append",
        help="Season(s) to build. Default: all.",
    )
    parser.add_argument("--variant", default="hina", help="Variant/experience key to build (default: hina).")
    parser.add_argument("--expected-blocks", type=int, default=13, help="Expected number of fenced blocks (default: 13).")
    parser.add_argument("--tag", action="append", dest="tags", default=[], help="Additional tags to pass to micro builder.")
    parser.add_argument("--force", action="store_true", help="Force micro store regeneration even if output exists.")
    parser.add_argument(
        "--no-clean-html",
        action="store_true",
        help="Skip cleaning HTML output before build (defaults to cleaning).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    seasons = args.season or sorted(SEASONS.keys())

    for season in seasons:
        spec = SEASONS[season]
        build_preview_for_season(
            spec,
            variant=args.variant,
            expected_blocks=args.expected_blocks,
            extra_tags=args.tags,
            force=args.force,
            clean_html=not args.no_clean_html,
        )


if __name__ == "__main__":
    main()
