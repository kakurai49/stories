"""Micro world storage helpers."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

from .io_utils import read_json, stable_json_dumps


def _normalize_for_fingerprint(obj: Any, *, drop_id: bool = False) -> Any:
    if isinstance(obj, dict):
        items = {}
        for key in sorted(obj.keys()):
            if drop_id and key == "id":
                continue
            value = obj[key]
            if value is None:
                continue
            items[key] = _normalize_for_fingerprint(value, drop_id=drop_id)
        return items
    if isinstance(obj, list):
        return [_normalize_for_fingerprint(item, drop_id=drop_id) for item in obj]
    return obj


def block_fingerprint(block: Dict[str, Any]) -> str:
    normalized = _normalize_for_fingerprint(block, drop_id=True)
    return stable_json_dumps(normalized)


def block_id_from_block(block: Dict[str, Any]) -> str:
    fp = block_fingerprint(block)
    digest = hashlib.sha1(fp.encode("utf-8")).hexdigest()
    return f"blk_{digest}"


@dataclass
class MicroStore:
    blocks_by_id: Dict[str, Dict[str, Any]]
    entities: List[Dict[str, Any]]

    def resolve_block(self, block_id: str) -> Dict[str, Any]:
        return self.blocks_by_id[block_id]


def load_micro_store(micro_dir: Path) -> MicroStore:
    blocks_dir = micro_dir / "blocks"
    entities_dir = micro_dir / "entities"

    blocks_by_id: Dict[str, Dict[str, Any]] = {}
    if blocks_dir.exists():
        for path in blocks_dir.glob("*.json"):
            block = read_json(path)
            blocks_by_id[block["id"]] = block

    entities: List[Dict[str, Any]] = []
    if entities_dir.exists():
        for path in entities_dir.glob("*.json"):
            entities.append(read_json(path))

    return MicroStore(blocks_by_id=blocks_by_id, entities=entities)
