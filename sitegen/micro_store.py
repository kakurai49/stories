"""Micro world storage helpers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

from .io_utils import read_json
from .micro_ids import block_fingerprint, block_id_from_block


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
