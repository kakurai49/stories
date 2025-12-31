"""Generate and compare MicroWorld snapshots from legacy posts."""

from __future__ import annotations

import difflib
import shutil
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from .io_utils import read_json, write_json_stable
from .types_micro import MicroBlock, MicroEntity
from .verify_roundtrip import legacy_to_micro


def _load_posts(posts_dir: Path) -> Iterable[Tuple[str, dict]]:
    for path in sorted(posts_dir.glob("*.json")):
        yield path.name, read_json(path)


def legacy_dir_to_micro_snapshot(
    posts_dir: Path, micro_dir: Path
) -> Tuple[List[MicroEntity], Dict[str, MicroBlock], dict]:
    entities: List[MicroEntity] = []
    blocks_by_id: Dict[str, MicroBlock] = {}

    for _, legacy in _load_posts(posts_dir):
        entity, blocks = legacy_to_micro(legacy)
        entities.append(entity)
        for block in blocks:
            blocks_by_id.setdefault(block["id"], block)

    entities_sorted = sorted(entities, key=lambda e: e["id"])
    blocks_sorted: Dict[str, MicroBlock] = {bid: blocks_by_id[bid] for bid in sorted(blocks_by_id)}

    index = {
        "entity_ids": [entity["id"] for entity in entities_sorted],
        "block_ids": list(blocks_sorted.keys()),
    }
    return entities_sorted, blocks_sorted, index


def write_micro_snapshot(
    micro_dir: Path, entities: List[MicroEntity], blocks: Dict[str, MicroBlock], index: dict
) -> None:
    if micro_dir.exists():
        shutil.rmtree(micro_dir)
    micro_dir.mkdir(parents=True, exist_ok=True)

    entities_dir = micro_dir / "entities"
    blocks_dir = micro_dir / "blocks"
    entities_dir.mkdir(parents=True, exist_ok=True)
    blocks_dir.mkdir(parents=True, exist_ok=True)

    for entity in entities:
        write_json_stable(entities_dir / f"{entity['id']}.json", entity)
    for block_id, block in blocks.items():
        write_json_stable(blocks_dir / f"{block_id}.json", block)
    write_json_stable(micro_dir / "index.json", index)


def generate_micro_snapshot_to_dir(posts_dir: Path, out_dir: Path) -> None:
    entities, blocks, index = legacy_dir_to_micro_snapshot(posts_dir, out_dir)
    write_micro_snapshot(out_dir, entities, blocks, index)


def _collect_json_files(directory: Path) -> Dict[str, List[str]]:
    contents: Dict[str, List[str]] = {}
    if not directory.exists():
        return contents
    for path in sorted(directory.rglob("*.json")):
        rel = str(path.relative_to(directory))
        contents[rel] = path.read_text(encoding="utf-8").splitlines(keepends=True)
    return contents


def compare_dirs(dir_a: Path, dir_b: Path) -> Tuple[bool, str]:
    files_a = _collect_json_files(dir_a)
    files_b = _collect_json_files(dir_b)
    all_paths = sorted(set(files_a.keys()) | set(files_b.keys()))

    diffs: List[str] = []
    for rel in all_paths:
        content_a = files_a.get(rel, [])
        content_b = files_b.get(rel, [])
        if content_a == content_b:
            continue
        diff = difflib.unified_diff(
            content_a,
            content_b,
            fromfile=f"{dir_a.name}/{rel}",
            tofile=f"{dir_b.name}/{rel}",
        )
        diffs.append("".join(diff))
    return (not diffs, "".join(diffs))
