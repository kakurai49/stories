"""Migration from legacy posts to micro world representation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .io_utils import read_json, warn, write_json
from .micro_store import block_id_from_block
from .types_legacy import LegacyPost
from .types_micro import MicroBlock, MicroEntity


REQUIRED_FIELDS = ["contentId", "experience", "pageType", "title", "summary", "render"]


def _to_pascal(name: str) -> str:
    if not name:
        return name
    return "".join(part.capitalize() for part in name.replace("-", " ").split())


def load_legacy_posts(posts_dir: Path) -> List[LegacyPost]:
    posts: List[LegacyPost] = []
    for path in sorted(posts_dir.glob("*.json")):
        try:
            data = read_json(path)
        except json.JSONDecodeError:
            warn(f"[legacy] failed to parse JSON: {path}")
            continue
        if not all(key in data for key in REQUIRED_FIELDS):
            warn(f"[legacy] missing required fields in {path}")
            continue
        posts.append(data)
    return posts


def _dedupe_blocks(blocks: List[Dict[str, Any]]) -> Tuple[List[str], Dict[str, MicroBlock]]:
    ids: List[str] = []
    unique: Dict[str, MicroBlock] = {}
    for block in blocks:
        block_id = block_id_from_block(block)
        block_with_id: MicroBlock = {"id": block_id, **block}
        ids.append(block_id)
        unique.setdefault(block_id, block_with_id)
    return ids, unique


def legacy_to_micro(legacy: LegacyPost) -> Tuple[MicroEntity, List[MicroBlock]]:
    blocks: List[Dict[str, Any]] = []
    render = legacy["render"]
    if render["kind"] == "html":
        blocks.append({"type": "RawHtml", "html": render["html"]})
    elif render["kind"] == "markdown":
        blocks.append({"type": "Markdown", "source": render["markdown"]})

    cta_label = legacy.get("ctaLabel")
    cta_href = legacy.get("ctaHref")
    if cta_label and cta_href:
        blocks.append({"type": "Link", "label": cta_label, "href": cta_href})

    block_refs, unique_blocks = _dedupe_blocks(blocks)

    meta: Dict[str, Any] = {
        "title": legacy.get("title"),
        "summary": legacy.get("summary"),
        "tags": legacy.get("tags", []),
    }
    for extra in ("role", "profile"):
        if extra in legacy:
            meta[extra] = legacy[extra]

    entity: MicroEntity = {
        "id": legacy["contentId"],
        "variant": legacy["experience"],
        "type": _to_pascal(legacy["pageType"]),
        "meta": meta,
        "body": {"blockRefs": block_refs},
        "relations": {},
    }
    return entity, list(unique_blocks.values())


def migrate_legacy_dir(posts_dir: Path, micro_dir: Path) -> None:
    posts = load_legacy_posts(posts_dir)
    blocks_dir = micro_dir / "blocks"
    entities_dir = micro_dir / "entities"
    blocks_dir.mkdir(parents=True, exist_ok=True)
    entities_dir.mkdir(parents=True, exist_ok=True)

    all_blocks: Dict[str, MicroBlock] = {}
    index_entities: List[Dict[str, Any]] = []

    for post in posts:
        entity, blocks = legacy_to_micro(post)
        for block in blocks:
            all_blocks.setdefault(block["id"], block)
        write_json(entities_dir / f"{entity['id']}.json", entity)
        index_entities.append(
            {
                "id": entity["id"],
                "variant": entity["variant"],
                "type": entity["type"],
                "meta": entity["meta"],
            }
        )

    for block in all_blocks.values():
        write_json(blocks_dir / f"{block['id']}.json", block)

    index = {"entities": index_entities, "blocks": sorted(all_blocks.keys())}
    write_json(micro_dir / "index.json", index)
