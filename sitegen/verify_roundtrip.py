"""Round-trip verification between legacy posts and micro world snapshots."""

from __future__ import annotations

import difflib
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .io_utils import read_json, stable_json_dumps
from .micro_store import block_id_from_block
from .types_legacy import LegacyPost, LegacyRender
from .types_micro import MicroBlock, MicroEntity


def legacy_to_micro(legacy: LegacyPost) -> Tuple[MicroEntity, List[MicroBlock]]:
    render: LegacyRender | None = legacy.get("render")  # type: ignore[assignment]
    if not render or "kind" not in render:
        raise ValueError("legacy render is required")

    blocks: List[Dict[str, Any]] = []
    if render["kind"] == "html":
        blocks.append({"type": "RawHtml", "html": render["html"]})
    elif render["kind"] == "markdown":
        blocks.append({"type": "Markdown", "source": render["markdown"]})
    else:  # pragma: no cover - defensive guard
        raise ValueError(f"unsupported render kind: {render['kind']}")

    block_refs: List[str] = []
    unique_blocks: Dict[str, MicroBlock] = {}
    for block in blocks:
        block_id = block_id_from_block(block)
        block_refs.append(block_id)
        unique_blocks.setdefault(block_id, {"id": block_id, **block})  # type: ignore[misc]

    meta: Dict[str, Any] = {}
    for key in ("title", "summary", "tags", "role", "profile"):
        if key in legacy:
            meta[key] = legacy[key]
    if "ctaLabel" in legacy or "ctaHref" in legacy:
        cta: Dict[str, Any] = {}
        if "ctaLabel" in legacy:
            cta["label"] = legacy["ctaLabel"]
        if "ctaHref" in legacy:
            cta["href"] = legacy["ctaHref"]
        meta["cta"] = cta

    entity: MicroEntity = {
        "id": legacy["contentId"],
        "variant": legacy["experience"],
        "type": legacy["pageType"],
        "meta": meta,
        "body": {"blockRefs": block_refs},
        "relations": {},
    }

    return entity, list(unique_blocks.values())


def micro_to_legacy(entity: MicroEntity, blocks_by_id: Dict[str, MicroBlock]) -> LegacyPost:
    render: LegacyRender | None = None  # type: ignore[assignment]
    for block_id in entity.get("body", {}).get("blockRefs", []):
        block = blocks_by_id[block_id]
        if block["type"] == "RawHtml":
            render = {"kind": "html", "html": block["html"]}
            break
        if block["type"] == "Markdown":
            render = {"kind": "markdown", "markdown": block["source"]}
            break
    if render is None:
        raise ValueError("micro entity missing render block")

    legacy: LegacyPost = {
        "contentId": entity["id"],
        "experience": entity["variant"],
        "pageType": entity["type"],
        "render": render,
    }

    meta = entity.get("meta", {})
    for key in ("title", "summary", "tags", "role", "profile"):
        if key in meta:
            legacy[key] = meta[key]

    cta = meta.get("cta")
    if isinstance(cta, dict):
        if "label" in cta:
            legacy["ctaLabel"] = cta["label"]
        if "href" in cta:
            legacy["ctaHref"] = cta["href"]

    return legacy


def _pretty_json(obj: Any) -> List[str]:
    return stable_json_dumps(obj).splitlines(keepends=True)


def verify_roundtrip_all(posts_dir: Path) -> Tuple[bool, List[str]]:
    errors: List[str] = []
    for path in sorted(posts_dir.glob("*.json")):
        legacy = read_json(path)
        entity, blocks = legacy_to_micro(legacy)
        restored = micro_to_legacy(entity, {block["id"]: block for block in blocks})
        if legacy != restored:
            diff = difflib.unified_diff(
                _pretty_json(legacy),
                _pretty_json(restored),
                fromfile=f"legacy/{path.name}",
                tofile=f"roundtrip/{path.name}",
            )
            errors.append("".join(diff))
    return not errors, errors
