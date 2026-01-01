#!/usr/bin/env python3
"""Generate micro store (v2) from nagi-s2 / nagi-s3 markdown sources.

Each ```text fenced block in the source markdown is treated as one episode.
The script extracts titles, normalizes bodies, and emits a deterministic
micro store compatible with the existing sitegen loaders.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from sitegen.io_utils import write_json_stable
from sitegen.micro_ids import block_id_from_block


DEFAULT_EXPECTED_BLOCKS = 13


@dataclass
class Episode:
    title: str
    body: str


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def normalize_body_text(text: str) -> str:
    """Normalize episode body for stable hashing and storage."""

    text = _normalize_newlines(text)
    lines = text.split("\n")
    trimmed = [line.rstrip() for line in lines]
    normalized = "\n".join(trimmed).rstrip("\n")
    return normalized


def summarize_body(body: str, limit: int = 140) -> str:
    collapsed = re.sub(r"\s+", " ", body).strip()
    return collapsed[:limit]


def extract_text_fences(markdown: str) -> List[str]:
    blocks: List[str] = []
    in_block = False
    current: List[str] = []

    for line in _normalize_newlines(markdown).split("\n"):
        stripped = line.strip()
        if not in_block:
            if stripped.startswith("```text"):
                in_block = True
                current = []
            continue

        if stripped == "```":
            blocks.append("\n".join(current))
            in_block = False
            current = []
            continue

        current.append(line)

    if in_block:
        raise ValueError("Unterminated ```text fenced block detected")

    return blocks


def _split_title_and_body(block_text: str) -> Episode:
    lines = _normalize_newlines(block_text).split("\n")
    title_line_idx = None
    for idx, line in enumerate(lines):
        if line.strip():
            title_line_idx = idx
            break

    if title_line_idx is None:
        raise ValueError("Block is empty; a title line is required")

    title = lines[title_line_idx].strip()
    body_lines = lines[title_line_idx + 1 :]
    while body_lines and not body_lines[0].strip():
        body_lines.pop(0)
    body = "\n".join(body_lines)
    return Episode(title=title, body=body)


def _build_block(body: str) -> dict:
    normalized_body = normalize_body_text(body)
    block = {"type": "Markdown", "source": normalized_body}
    block_id = block_id_from_block(block)
    return {"id": block_id, **block}


def _build_entity(
    *,
    season: str,
    index: int,
    title: str,
    body: str,
    block_id: str,
    variant: str,
    extra_tags: Iterable[str],
) -> dict:
    entity_id = f"{season}-ep{index:02d}"
    tags = ["story", "episode", season, *extra_tags]
    summary = summarize_body(body)
    return {
        "id": entity_id,
        "variant": variant,
        "type": "story",
        "meta": {
            "title": title,
            "summary": summary,
            "tags": tags,
        },
        "body": {"blockRefs": [block_id]},
        "relations": {"season": season, "index": index},
    }


def build_micro_store(
    *,
    input_path: Path,
    out_dir: Path,
    season: str,
    variant: str,
    expected_blocks: int,
    extra_tags: Iterable[str],
    force: bool,
) -> None:
    markdown = input_path.read_text(encoding="utf-8")
    fences = extract_text_fences(markdown)

    if expected_blocks and len(fences) != expected_blocks:
        raise SystemExit(
            f"Expected {expected_blocks} fenced blocks but found {len(fences)} in {input_path}"
        )

    if out_dir.exists():
        if not force:
            raise SystemExit(f"Output directory already exists: {out_dir}. Use --force to overwrite.")
        shutil.rmtree(out_dir)

    entities_dir = out_dir / "entities"
    blocks_dir = out_dir / "blocks"
    entities_dir.mkdir(parents=True, exist_ok=True)
    blocks_dir.mkdir(parents=True, exist_ok=True)

    entities: list[dict] = []
    block_ids: list[str] = []
    blocks_by_id: dict[str, dict] = {}

    for idx, block_text in enumerate(fences, start=1):
        episode = _split_title_and_body(block_text)
        block = _build_block(episode.body)
        block_id = block["id"]
        entity = _build_entity(
            season=season,
            index=idx,
            title=episode.title,
            body=episode.body,
            block_id=block_id,
            variant=variant,
            extra_tags=extra_tags,
        )

        if block_id not in blocks_by_id:
            blocks_by_id[block_id] = block
            block_ids.append(block_id)
            write_json_stable(blocks_dir / f"{block_id}.json", block)
        write_json_stable(entities_dir / f"{entity['id']}.json", entity)

        entities.append(entity)

    index = {
        "entity_ids": [entity["id"] for entity in entities],
        "block_ids": block_ids,
    }
    write_json_stable(out_dir / "index.json", index)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert markdown fences to micro store (v2)")
    parser.add_argument("--input", required=True, type=Path, help="Input markdown file with ```text fences")
    parser.add_argument("--out", required=True, type=Path, help="Output directory for the generated micro store")
    parser.add_argument("--season", required=True, help="Season identifier (e.g., nagi-s2)")
    parser.add_argument("--variant", default="hina", help="Variant to embed in entities (default: hina)")
    parser.add_argument(
        "--expected-blocks",
        type=int,
        default=DEFAULT_EXPECTED_BLOCKS,
        help="Number of ```text fences expected in the input (default: 13)",
    )
    parser.add_argument(
        "--tag",
        action="append",
        dest="tags",
        default=[],
        help="Additional meta tags (can be provided multiple times)",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite the output directory if it exists")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)

    build_micro_store(
        input_path=args.input,
        out_dir=args.out,
        season=args.season,
        variant=args.variant,
        expected_blocks=args.expected_blocks,
        extra_tags=args.tags,
        force=args.force,
    )

    print(f"Wrote micro store to {args.out}")


if __name__ == "__main__":
    main(sys.argv[1:])
