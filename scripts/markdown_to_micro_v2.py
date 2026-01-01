"""Convert markdown chapters into micro store artifacts for the v2 pipeline.

This helper reads code-fenced story chapters (```text ... ```) from a markdown
file, converts each chapter into a Markdown micro block, and emits matching
entities and index metadata suitable for `sitegen.cli_build_site`.
"""

from __future__ import annotations

import argparse
import re
import shutil
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

# Ensure local package imports work when executed as a script.
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sitegen.io_utils import write_json_stable
from sitegen.micro_ids import block_id_from_block


CODE_BLOCK_RE = re.compile(r"```(?:text)?\n(.*?)```", re.DOTALL)


@dataclass
class Chapter:
    """Parsed chapter from a markdown code fence."""

    order: int
    raw_text: str

    @property
    def title(self) -> str:
        for line in self.raw_text.splitlines():
            if line.strip():
                return line.strip()
        return f"Episode {self.order:02d}"

    @property
    def summary(self) -> str:
        collapsed = " ".join(line.strip() for line in self.raw_text.splitlines() if line.strip())
        return textwrap.shorten(collapsed, width=140, placeholder="…") or self.title


def parse_chapters(markdown_path: Path) -> list[Chapter]:
    text = markdown_path.read_text(encoding="utf-8")
    matches = CODE_BLOCK_RE.findall(text)
    chapters = [Chapter(order=i + 1, raw_text=match.strip()) for i, match in enumerate(matches)]
    if not chapters:
        raise ValueError(f"No code fences found in {markdown_path}")
    return chapters


def _default_tags(season: str) -> list[str]:
    return ["story", "episode", season]


def write_micro_store(
    *,
    chapters: Iterable[Chapter],
    out_dir: Path,
    season: str,
    variant: str,
    page_type: str,
    extra_tags: list[str] | None = None,
    force: bool = False,
) -> None:
    if out_dir.exists():
        if not force:
            raise FileExistsError(f"Refusing to overwrite existing directory: {out_dir}")
        shutil.rmtree(out_dir)

    blocks_dir = out_dir / "blocks"
    entities_dir = out_dir / "entities"
    blocks_dir.mkdir(parents=True, exist_ok=True)
    entities_dir.mkdir(parents=True, exist_ok=True)

    block_ids: list[str] = []
    entity_ids: list[str] = []

    for chapter in chapters:
        block = {"type": "Markdown", "source": chapter.raw_text}
        block_id = block_id_from_block(block)
        block["id"] = block_id
        block_ids.append(block_id)
        write_json_stable(blocks_dir / f"{block_id}.json", block)

        tags = extra_tags or _default_tags(season)
        entity_id = f"{season}-ep{chapter.order:02d}"
        entity = {
            "id": entity_id,
            "variant": variant,
            "type": page_type,
            "meta": {
                "title": chapter.title,
                "summary": chapter.summary,
                "tags": tags,
            },
            "body": {"blockRefs": [block_id]},
            "relations": {"season": season, "index": chapter.order},
        }
        entity_ids.append(entity_id)
        write_json_stable(entities_dir / f"{entity_id}.json", entity)

    index = {"entity_ids": entity_ids, "block_ids": block_ids}
    write_json_stable(out_dir / "index.json", index)


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert markdown code fences into micro store artifacts.")
    parser.add_argument("--input", required=True, type=Path, help="Path to the markdown source file.")
    parser.add_argument(
        "--out",
        required=True,
        type=Path,
        help="Output directory for the micro store (will contain index.json, blocks/, entities/).",
    )
    parser.add_argument(
        "--season",
        required=False,
        help="Season or prefix used for entity ids and relations (defaults to the markdown stem).",
    )
    parser.add_argument("--variant", default="hina", help="Experience variant to write into entities.")
    parser.add_argument("--page-type", default="story", dest="page_type", help="Page type to assign to entities.")
    parser.add_argument(
        "--tag",
        action="append",
        dest="tags",
        help="Additional tag to attach; repeatable. Defaults to ['story', 'episode', <season>].",
    )
    parser.add_argument(
        "--expected-blocks",
        type=int,
        default=13,
        help="Fail if the markdown does not contain this many code fences (default: 13).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow overwriting an existing output directory by deleting it first.",
    )
    args = parser.parse_args()

    season = args.season or args.input.stem
    chapters = parse_chapters(args.input)
    if args.expected_blocks and len(chapters) != args.expected_blocks:
        raise SystemExit(
            f"Expected {args.expected_blocks} code fences in {args.input}, found {len(chapters)} instead."
        )

    write_micro_store(
        chapters=chapters,
        out_dir=args.out,
        season=season,
        variant=args.variant,
        page_type=args.page_type,
        extra_tags=args.tags,
        force=args.force,
    )
    print(f"Wrote micro store with {len(chapters)} chapters to {args.out}")


if __name__ == "__main__":
    main()
